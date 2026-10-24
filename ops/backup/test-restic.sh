#!/usr/bin/env bash
# Synthetic integration check using the real upstream restic binary and SQLite.
set -euo pipefail
umask 077
script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=ops/backup/triad-backup.sh
source "$script_directory/triad-backup.sh"
command -v sqlite3 >/dev/null
restic_bin=${RESTIC_BIN:-restic}
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
if ! command -v "$restic_bin" >/dev/null; then
  restic_bin="$temporary/restic"
  bash "$script_directory/../setup-restic.sh" "$restic_bin"
fi
export RESTIC_PASSWORD=synthetic-test-password-not-a-production-secret
export RESTIC_FROM_PASSWORD=$RESTIC_PASSWORD
source_repo="$temporary/backups/restic"
remote_repo="$temporary/offsite"
staging="$temporary/staging"
mkdir "$staging" "$temporary/backups"
python3 - "$script_directory/triad-backup.sh" "$temporary" <<'PY'
import pathlib, sqlite3, stat, subprocess, sys
script, root = sys.argv[1], pathlib.Path(sys.argv[2])
def snapshot(source, destination):
    return subprocess.run(['bash', '-c', 'source "$1"; sqlite_snapshot "$2" "$3"',
                           'sqlite-fixture', script, str(source), str(destination)],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=190).returncode

# Keep the writer open: committed rows must still be read from its WAL.
source, destination = root / 'wal.db', root / 'verified.db'
with sqlite3.connect(source) as writer:
    writer.execute('PRAGMA journal_mode=WAL')
    writer.execute('PRAGMA wal_autocheckpoint=0')
    writer.execute('CREATE TABLE applications (id INTEGER PRIMARY KEY)')
    writer.execute('INSERT INTO applications VALUES (42)')
    writer.commit()
    assert pathlib.Path(f'{source}-wal').stat().st_size > 0
    assert snapshot(source, destination) == 0, 'Committed WAL snapshot must succeed'
    with sqlite3.connect(destination) as restored:
        assert restored.execute('SELECT id FROM applications').fetchall() == [(42,)]
        assert restored.execute('PRAGMA journal_mode').fetchone() == ('delete',)
        assert restored.execute('PRAGMA integrity_check').fetchone() == ('ok',)
    assert stat.S_IMODE(destination.stat().st_mode) == 0o600
    assert not pathlib.Path(f'{destination}-wal').exists()
    before = destination.read_bytes()
    assert snapshot(source, destination) != 0, 'Existing destination must be refused'
    assert destination.read_bytes() == before
    link = root / 'alias.db'
    link.symlink_to(source)
    assert snapshot(link, root / 'refused.db') != 0, 'Symlink source must be refused'
    assert snapshot(source, link) != 0, 'Symlink destination must be refused'
    assert link.is_symlink()
    link.unlink()
    link.symlink_to(root, target_is_directory=True)
    assert snapshot(source, link / 'refused.db') != 0, 'Symlink parent must be refused'
    assert not (root / 'refused.db').exists()
    assert snapshot(source, root / 'quoted\'path.db') != 0, 'Dot-command quoting must be refused'
corrupt = root / 'corrupt.db'
corrupt.write_bytes(b'not a SQLite database')
assert snapshot(corrupt, root / 'failed.db') != 0
assert not (root / 'failed.db').exists(), 'Failed snapshots must be removed'
print('PASS: SQLite CLI committed WAL, standalone restore, corruption and path guards.')
PY
printf 'existing legacy recovery copy\n' > "$temporary/backups/applications-legacy.db"
if "$restic_bin" --no-cache -r "$source_repo" cat config >/dev/null 2>&1; then
  echo 'Expected an uninitialized fixture repository' >&2
  exit 1
else
  [[ $? -eq 10 ]]
fi
"$restic_bin" --no-cache -r "$source_repo" init >/dev/null
python3 - "$temporary/live.db" <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    db.execute('CREATE TABLE applications (id INTEGER PRIMARY KEY)')
PY
for day in $(seq 1 12); do
  python3 - "$temporary/live.db" <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    db.execute('INSERT INTO applications DEFAULT VALUES')
PY
  rm -f -- "$staging/applications.db"
  sqlite_snapshot "$temporary/live.db" "$staging/applications.db"
  printf -v snapshot_time '2000-01-%02d 12:00:00' "$day"
  "$restic_bin" --no-cache -r "$source_repo" backup --quiet --host triad-tactics --tag production \
    --time "$snapshot_time" "$staging"
done
"$restic_bin" --no-cache -r "$source_repo" check --read-data >/dev/null
"$restic_bin" --no-cache -r "$source_repo" forget --host triad-tactics --tag production --group-by host \
  --keep-last 10 --prune --max-repack-size 256M >/dev/null
"$restic_bin" --no-cache -r "$source_repo" snapshots --json | python3 -c \
  'import json,sys; assert len(json.load(sys.stdin)) == 10, "Local retention must preserve exactly ten"'
[[ $(cat "$temporary/backups/applications-legacy.db") == 'existing legacy recovery copy' ]]
python3 - "$restic_bin" "$source_repo" <<'PY'
import os, pathlib, subprocess, sys, time
restic, repository = sys.argv[1:]
base = [restic, '--no-cache', '-r', repository]
wrong = subprocess.run(base + ['cat', 'config'], env={**os.environ, 'RESTIC_PASSWORD': 'wrong-fixture-password'},
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
assert wrong.returncode not in (0, 10), 'Wrong passwords must not look like an uninitialized repository'
# A real restic process holds its normal shared lock while awaiting stdin. Prune
# must time out without deleting data, rather than bypassing that lock.
holder = subprocess.Popen(base + ['backup', '--stdin', '--stdin-filename', 'waiting'],
                          stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for attempt in range(100):
        if list((pathlib.Path(repository) / 'locks').iterdir()):
            break
        assert holder.poll() is None, 'Lock fixture exited before acquiring a lock'
        time.sleep(0.1)
    else:
        raise AssertionError('Lock fixture did not acquire a lock')
    result = subprocess.run(base + ['--retry-lock', '1s', 'prune'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
    assert result.returncode != 0, 'Prune must respect the active backup lock'
finally:
    holder.terminate()
    try:
        holder.wait(timeout=5)
    except subprocess.TimeoutExpired:
        holder.kill()
        holder.wait(timeout=5)
    holder.stdin.close()
PY
"$restic_bin" --no-cache -r "$remote_repo" init --from-repo "$source_repo" --copy-chunker-params >/dev/null
for _ in 1 2; do
  "$restic_bin" --no-cache -r "$remote_repo" copy --from-repo "$source_repo" \
    --host triad-tactics --tag production latest >/dev/null
done
"$restic_bin" --no-cache -r "$remote_repo" snapshots --json | python3 -c \
  'import json,sys; assert len(json.load(sys.stdin)) == 1, "Copy must select latest and be idempotent"'
"$restic_bin" --no-cache -r "$remote_repo" check --read-data >/dev/null
"$restic_bin" --no-cache -r "$remote_repo" forget --host triad-tactics --tag production --group-by host \
  --keep-last 10 --keep-within 30d --prune --max-repack-size 256M >/dev/null
"$restic_bin" --no-cache -r "$remote_repo" check >/dev/null
"$restic_bin" --no-cache -r "$remote_repo" restore latest --host triad-tactics --target "$temporary/restore" >/dev/null
python3 - "$temporary/restore/${staging#/}/applications.db" <<'PY'
import sqlite3, sys
with sqlite3.connect(f'file:{sys.argv[1]}?mode=ro', uri=True) as db:
    assert db.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
    assert db.execute('SELECT count(*) FROM applications').fetchone() == (12,)
PY
printf 'PASS: real restic init, wrong-password refusal, lock timeout, 10-snapshot retention, latest-only copy, readback and SQLite restore.\n'
