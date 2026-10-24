#!/usr/bin/env bash
# Thin application hook around restic; installed root-owned by Ansible.
sqlite_snapshot() {
  local source=$1 destination=$2 result
  # Production paths are fixed; reject aliases and quoting characters before
  # passing the destination to SQLite's dot-command parser.
  if [[ ! $source =~ ^/[A-Za-z0-9_./-]+$ || ! $destination =~ ^/[A-Za-z0-9_./-]+$ ||
        ! -f $source || -L $source || -e $destination || -L $destination ]] ||
      [[ $(realpath -m -- "$source") != "$source" || $(realpath -m -- "$destination") != "$destination" ]]; then
    echo 'SQLite snapshot requires a regular source and a new canonical destination' >&2
    return 1
  fi
  if result=$(timeout --kill-after=5 180 sqlite3 -batch -bail -readonly -noheader -list "$source" \
      '.timeout 30000' ".backup '$destination'" ".open '$destination'" \
      'PRAGMA journal_mode=DELETE; PRAGMA integrity_check;') && [[ $result == $'delete\nok' ]]; then
    return 0
  fi
  rm -f -- "$destination"
  echo 'SQLite snapshot failed verification' >&2
  return 1
}

rollback_images_protected() {
  local metadata=$1 service recorded expected actual
  [[ -f $metadata ]] || return 1
  for service in app nginx cron; do
    recorded=$(jq -er --arg service "$service" \
      '.services[$service].image | select(type == "string" and length > 0)' "$metadata") || return 1
    expected=$(docker image inspect --format '{{.Id}}' -- "$recorded") || return 1
    actual=$(docker container inspect --format '{{.Image}}' "triad-tactics-rollback-$service") || return 1
    [[ -n $expected && $expected == "$actual" ]] || return 1
  done
}

# Tests source these hooks without invoking host tasks.
if [[ ${BASH_SOURCE[0]} != "$0" ]]; then return 0; fi
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
if [[ -e /opt/triad-tactics/.deploy/current || -L /opt/triad-tactics/.deploy/current ]]; then
  release=/opt/triad-tactics/.deploy/current
else
  release=$(jq -er '.[0].Config.Labels["com.docker.compose.project.working_dir"]' "$staging/application-container.json")
fi
release=$(realpath -- "$release")
[[ $release == /opt/triad-tactics || $release == /opt/triad-tactics/.deploy/releases/* ]]
database=$(jq -er '.[0].Mounts[] | select(.Destination == "/app/database" and .Type == "volume" and .Name == "triad-tactics_db") | .Source' \
  "$staging/application-container.json")
[[ $database == /var/lib/docker/volumes/triad-tactics_db/_data ]]
available=$(df --output=avail -B1 "$staging" | tail -n 1)
required=$(( $(stat -c %s "$database/applications.db") * 3 + 512 * 1024 * 1024 ))
(( available >= required )) || { echo 'Insufficient space for a verified backup and bounded repacking' >&2; exit 1; }
sqlite_snapshot "$database/applications.db" "$staging/applications.db"
install -m 0600 /opt/triad-tactics/.env "$staging/.env"
install -m 0600 "$release/docker-compose.yml" "$staging/docker-compose.yml"
install -d -m 0700 "$staging/nginx"
install -m 0600 "$release/nginx/default.conf" "$staging/nginx/default.conf"
for file in image.override.json images.yml; do
  if [[ -f $release/$file ]]; then install -m 0600 "$release/$file" "$staging/$file"; fi
done
if [[ -d /etc/letsencrypt ]]; then cp -a /etc/letsencrypt "$staging/letsencrypt"; fi
revision=$(jq -r '.[0].Config.Labels["org.opencontainers.image.revision"] // empty' "$staging/application-container.json")
if [[ ! $revision =~ ^[0-9a-f]{40}$ && -f $release/image.override.json ]]; then
  revision=$(jq -r '.["x-triad-revision"] // empty' "$release/image.override.json")
fi
if [[ ! $revision =~ ^[0-9a-f]{40}$ && -f $release/REVISION ]]; then
  revision=$(cat "$release/REVISION")
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
# Docker preserves container images. A failed rollout may leave mixed holders,
# so require every holder to match the recorded previous release before pruning.
if rollback_images_protected /opt/triad-tactics/.deploy/previous/image.override.json 2>/dev/null; then
  docker image prune --all --force --filter until=24h
  docker builder prune --all --force --filter until=24h
else
  echo 'Docker cleanup skipped: rollback holders do not match the previous release.'
fi
