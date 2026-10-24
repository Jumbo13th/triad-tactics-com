#!/usr/bin/env bash
# Thin application hook around restic; installed root-owned by Ansible.
set -euo pipefail
umask 077
export PATH=/usr/local/bin:/usr/bin:/bin
[[ $EUID -eq 0 && $# -eq 0 ]] || { echo 'Run triad-backup as root without arguments' >&2; exit 1; }
exec 9>/run/lock/triad-backup.lock
flock --wait 900 9
export RESTIC_REPOSITORY=/opt/triad-tactics/backups/restic
export RESTIC_PASSWORD_FILE=/etc/triad-backup/restic-password
[[ -f $RESTIC_PASSWORD_FILE && ! -L $RESTIC_PASSWORD_FILE ]]
[[ $(stat -c '%u:%a' "$RESTIC_PASSWORD_FILE") == 0:600 ]]
staging=/var/lib/triad-backup/staging
[[ ! -L /var/lib/triad-backup && ! -L $staging && ! -L $RESTIC_REPOSITORY ]]
install -d -m 0700 /var/lib/triad-backup "$staging" "$RESTIC_REPOSITORY"
# The staging directory is fixed so restic deduplication and restore paths stay stable.
trap 'find "$staging" -mindepth 1 -delete' EXIT
find "$staging" -mindepth 1 -delete
mapfile -t containers < <(docker ps -q --filter label=com.docker.compose.project=triad-tactics \
  --filter label=com.docker.compose.service=app)
[[ ${#containers[@]} -eq 1 ]] || { echo 'Expected one running Triad application container' >&2; exit 1; }
app=${containers[0]}
docker inspect "$app" > "$staging/application-container.json"
release=$(jq -er '.[0].Config.Labels["com.docker.compose.project.working_dir"]' "$staging/application-container.json")
release=$(realpath -- "$release")
[[ $release == /opt/triad-tactics || $release == /opt/triad-tactics/.deploy/releases/* ]]
database=$(jq -er '.[0].Mounts[] | select(.Destination == "/app/database" and .Type == "volume" and .Name == "triad-tactics_db") | .Source' \
  "$staging/application-container.json")
[[ $database == /var/lib/docker/volumes/triad-tactics_db/_data ]]
available=$(df --output=avail -B1 "$staging" | tail -n 1)
required=$(( $(stat -c %s "$database/applications.db") * 3 + 512 * 1024 * 1024 ))
(( available >= required )) || { echo 'Insufficient space for a verified backup and bounded repacking' >&2; exit 1; }
python3 /usr/local/lib/triad-backup/sqlite_snapshot.py "$database/applications.db" "$staging/applications.db"
install -m 0600 /opt/triad-tactics/.env "$staging/.env"
install -m 0600 "$release/docker-compose.yml" "$staging/docker-compose.yml"
install -d -m 0700 "$staging/nginx"
install -m 0600 "$release/nginx/default.conf" "$staging/nginx/default.conf"
for file in image.override.json images.yml; do
  if [[ -f $release/$file ]]; then install -m 0600 "$release/$file" "$staging/$file"; fi
done
if [[ -d /etc/letsencrypt ]]; then cp -a /etc/letsencrypt "$staging/letsencrypt"; fi
if [[ -f $release/REVISION ]]; then
  revision=$(cat "$release/REVISION")
else
  revision=$(jq -r '.[0].Config.Labels["org.opencontainers.image.revision"] // empty' "$staging/application-container.json")
fi
if [[ $revision =~ ^[0-9a-f]{40}$ ]]; then
  printf '%s\n' "$revision" > "$staging/REVISION"
  if git -C /opt/triad-tactics cat-file -e "$revision^{commit}" 2>/dev/null; then
    git -C /opt/triad-tactics archive --format=tar --output="$staging/source.tar" "$revision"
  fi
else
  # Legacy images may predate revision labels. Keep their database and image
  # metadata recoverable without claiming the current checkout is their source.
  printf 'unknown\n' > "$staging/REVISION"
  echo 'Source revision unavailable; container image metadata is included.'
fi
restic_args=(--no-cache --retry-lock 5m)
if [[ ! -f $RESTIC_REPOSITORY/config ]]; then restic "${restic_args[@]}" init; fi
restic "${restic_args[@]}" backup --host triad-tactics --tag production "$staging"
restic "${restic_args[@]}" check --read-data
restic "${restic_args[@]}" forget --host triad-tactics --tag production --group-by host \
  --keep-last 10 --prune --max-repack-size 256M
restic "${restic_args[@]}" check
# Docker always preserves images referenced by containers. Require all rollback
# holders before pruning; Ansible maintains them after successful deployments.
if docker inspect triad-tactics-rollback-app triad-tactics-rollback-nginx triad-tactics-rollback-cron >/dev/null 2>&1; then
  docker image prune --all --force --filter until=24h
  docker builder prune --all --force --filter until=24h
fi
