#!/usr/bin/env bash
# GitHub runner only: restic handles encryption, transfer, verification and retention.
set -euo pipefail
umask 077
: "${BUNNY_STORAGE_PASSWORD:?Missing BUNNY_STORAGE_PASSWORD}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?Missing BACKUP_ENCRYPTION_PASSPHRASE}"
[[ ${#BACKUP_ENCRYPTION_PASSPHRASE} -ge 32 && $BACKUP_ENCRYPTION_PASSPHRASE != *$'\n'* && $BACKUP_ENCRYPTION_PASSPHRASE != *$'\r'* ]]
export AWS_ACCESS_KEY_ID=${BUNNY_STORAGE_ZONE:-triad-tactics-com}
[[ $AWS_ACCESS_KEY_ID =~ ^[a-z0-9][a-z0-9-]{3,62}$ ]]
case ${BUNNY_STORAGE_ENDPOINT:-storage.bunnycdn.com} in
  storage.bunnycdn.com) export AWS_DEFAULT_REGION=de ;;
  uk.storage.bunnycdn.com|ny.storage.bunnycdn.com|la.storage.bunnycdn.com|sg.storage.bunnycdn.com|se.storage.bunnycdn.com|jh.storage.bunnycdn.com|syd.storage.bunnycdn.com)
    export AWS_DEFAULT_REGION=${BUNNY_STORAGE_ENDPOINT%%.*} ;;
  *) echo 'Use the official Bunny HTTP hostname for the primary storage region' >&2; exit 1 ;;
esac
export AWS_SECRET_ACCESS_KEY=$BUNNY_STORAGE_PASSWORD
export RESTIC_PASSWORD=$BACKUP_ENCRYPTION_PASSPHRASE
export RESTIC_FROM_PASSWORD=$RESTIC_PASSWORD
export RESTIC_REPOSITORY="s3:https://${AWS_DEFAULT_REGION}-s3.storage.bunnycdn.com/$AWS_ACCESS_KEY_ID/triad-restic"
source_repository=sftp:triad-vps:/opt/triad-tactics/backups/restic
unset BACKUP_ENCRYPTION_PASSPHRASE BUNNY_STORAGE_PASSWORD
# The standard service bounds host runtime even if the SSH connection drops.
timeout 22m ssh triad-vps systemctl start --wait triad-backup.service
restic_args=(--no-cache --retry-lock 5m)
if restic "${restic_args[@]}" cat config >/dev/null; then
  :
else
  status=$?
  # Exit 10 means uninitialized repository in restic >= 0.17; other failures must
  # never trigger initialization or retention (including incorrect passwords).
  [[ $status -eq 10 ]] || exit "$status"
  restic "${restic_args[@]}" init --from-repo "$source_repository" --copy-chunker-params
fi
restic "${restic_args[@]}" copy --from-repo "$source_repository" --host triad-tactics --tag production latest
restic "${restic_args[@]}" check --read-data
restic "${restic_args[@]}" forget --host triad-tactics --tag production --group-by host \
  --keep-last 10 --keep-within 30d --prune --max-repack-size 256M
restic "${restic_args[@]}" check
restic "${restic_args[@]}" snapshots --host triad-tactics --tag production --latest 1
if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
  {
    printf 'Verified restic snapshot copied to private Bunny Storage.\n\n'
    printf 'Repository: %s\n\n' "$RESTIC_REPOSITORY"
    printf 'Retention: last 10 snapshots locally; 30 days and at least 10 snapshots remotely.\n\n'
    printf '```text\n'
    restic "${restic_args[@]}" snapshots --host triad-tactics --tag production --latest 1
    printf '```\n'
  } >> "$GITHUB_STEP_SUMMARY"
fi
