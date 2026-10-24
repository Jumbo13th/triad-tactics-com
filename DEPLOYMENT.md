# Production pipeline

The application stays on the Alexhost VPS as the existing Docker Compose stack:
Next.js, nginx, and cron, with SQLite in `triad-tactics_db`. GitHub Actions runs CI,
publishes the tested image to GHCR, and calls Ansible's `community.docker` modules
for deployment. Restic manages encryption, backup transfer, verification, and
retention. No operator-PC backup or credential file is required.

## Bunny access boundary

Bunny is backend-only because many users cannot reach its services. The backup
workflow accesses private Bunny Storage from a GitHub runner; users' browsers do
not contact Bunny. Keep public pages, login, APIs, and assets on infrastructure
users can reach. Do not introduce Bunny CDN/Shield proxy routing, browser asset
URLs, or redirects/download links that depend on direct Bunny access.

Bunny availability must affect only offsite backup operations. Local backups and
application deployment use the VPS repository, and serving the website does not
depend on Bunny. Any future Bunny integration must preserve this boundary.

## CI and updates

CI runs npm audit, lint, application tests, operations validation, and a production
container smoke test with external networking disabled. Official Docker actions
build once; the exact tested image is published on a trusted `main` push. Trivy
scans the two production images, blocking fixable HIGH/CRITICAL findings and
retaining reports that also show unfixed findings. App and cron share the same
image; cron uses Node's built-in HTTP client without installing extra packages.

Use the Node version in `.nvmrc` and the npm major declared in `package.json`.
Commit the lockfile with dependency changes. Renovate proposes updates under
[the documented policy](docs/DEPENDENCY_UPDATES.md); required reviews, Dependabot
alerts, and CodeQL remain in place. Checks identify known issues; they cannot
guarantee that the application has no vulnerabilities.

## Deployment

After CI passes on `main`, the workflow checks out the tested revision. Ansible
pauses the host backup timer, waits for a running backup, and creates a verified backup. It pulls
the tested GHCR digest and uses Docker Compose to roll out the services and wait
for healthchecks. HTTPS checks run from the GitHub runner. Cron is paused during
cutover. Registry credentials are short-lived and removed when deployment finishes
or fails.

CI checks the actual container's Node version, HTTP responses, and native SQLite;
the app checks required environment variables when starting. Deployment relies
on these checks instead of maintaining a second copy of the same validations.

A failed cutover restores previous images and Compose/nginx configuration while
preserving the current database. Automatic database rollback would discard
writes. Changes under `src/platform/db` require a reviewed manual migration plan.
An unknown running revision stops deployment; never guess compatibility from an
unrelated checkout. The workflow needs full Git history for this comparison.

Small immutable release configurations live under
`/opt/triad-tactics/.deploy/releases`; `current` and `previous` symlinks identify
the managed releases. Rollback reuses the recorded configuration and image pins.
The production override declares the existing `triad-tactics_db` volume external,
so Compose cannot silently replace it with a new empty database volume.

The current containers and three stopped rollback holders preserve current and
previous images from pruning. Cleanup verifies that the holders match the
recorded previous release before deleting unused images. There are three
workflows: CI, production, and offsite backup. Production handles both automatic
deployment and manually started maintenance setup. Production and offsite jobs
share a queued concurrency group.
Run manual production changes through the managed release procedure; directly
changing containers or release files makes the recorded state unreliable and
requires a reviewed reconciliation before the next deployment.

## Secrets and activation

The protected GitHub **production** environment contains:

| Setting | Type | Purpose |
| --- | --- | --- |
| `DEPLOY_SSH_KEY` | Secret | Dedicated production SSH identity |
| `DEPLOY_KNOWN_HOSTS` | Secret | Independently verified server host key |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Secret | Restic password, at least 32 characters, no newlines |
| `BUNNY_STORAGE_PASSWORD` | Secret | Storage Zone Password, not the account API key |
| `DEPLOY_HOST` | Variable | VPS hostname/IP |
| `BUNNY_STORAGE_ZONE` | Optional variable | Defaults to `triad-tactics-com` |
| `BUNNY_STORAGE_ENDPOINT` | Optional variable | Defaults to `storage.bunnycdn.com` for Frankfurt |

Set the **repository** variable `STANDARD_PIPELINE_ENABLED=true` only after the
migration and recovery verification below. When unset, automatic deployment and
scheduled offsite copies remain disabled. Manual bootstrap and offsite backup
are still available from protected `main`.

The VPS app continues reading `/opt/triad-tactics/.env`. These workflows do not
replace existing application credentials. `scripts/checkRequiredEnv.mjs` defines
the production requirements, including Steam, Discord, Brevo, cron, and encryption
settings. Keep the server-action key stable across deployments.

### One-time migration

1. Review and merge through normal checks. Keep production restricted to `main`.
2. Apply the approved change to the dedicated SSH key's scope after merging. Its existing
   `command="...triad_host.py ssh"` restriction blocks Ansible and SFTP. An
   administrator must replace that forced-command entry with the approved
   automation identity. Retaining SSH `restrict` disables forwarding and PTYs
   but **does not restrict command execution**: this identity has root-equivalent
   access. Workflows never change `authorized_keys` themselves.
3. Run **Production deployment and setup** manually from `main`. It adopts the
   existing Compose installation once, recording its image pins and verified
   revision. If the running app lacks an OCI revision label, supply its
   independently verified deployed commit in the optional `adopt_revision`
   input; never infer it from the current checkout's Git HEAD. Routine deployments
   subsequently use this recorded state instead of rediscovering legacy layouts.
   Setup also installs pinned restic, SQLite's CLI, backup units, and a root-only
   (`0600`) copy of the GitHub-held recovery password for independent VPS backups.
   The Bunny password stays in GitHub. Setup refuses to replace an existing
   password with a different one and verifies the new backup before retiring
   the legacy maintenance schedule.
4. Run **Offsite backup** manually. The private Bunny zone must have S3 compatibility
   enabled. Frankfurt is primary; Bunny manages Stockholm replication. The S3
   interface is currently Public Preview, so actual copy/restore verification is
   required before activation.
5. Perform the recovery drill below. Archive any legacy backup sets you want to
   retain externally, verify the copy, then retire their explicitly reviewed VPS
   files. Bootstrap leaves legacy bundles untouched; they temporarily consume
   extra space outside restic's retention. Do not delete the whole `backups`
   directory: it contains the new repository. Inspect legacy database-volume
   `backups` copies too. This is a one-time operator migration step.
6. Set repository variable `STANDARD_PIPELINE_ENABLED=true`. A later successful
   `main` push deploys automatically. The first successful deployment creates
   rollback holders; routine Docker pruning waits until all three match the
   recorded previous release.

Keep the recovery password in a password manager too: GitHub cannot reveal saved
secrets. Restic password rotation requires its key-management procedure; changing
only the GitHub secret does not unlock existing repositories. Credentials are
used on temporary GitHub Linux runners. The VPS retains its runtime password and
encrypted local repository; nothing is downloaded to the operator's computer.

## Backups and disk usage

| Operation | Schedule | Retention |
| --- | --- | --- |
| VPS backup | Daily 04:15 UTC, up to 15 minutes jitter | Latest 10 snapshots |
| Pre-deployment backup | Each deployment | Same local 10-snapshot policy |
| Offsite backup | Daily 04:47 UTC or manually | Last 30 days, at least 10 snapshots |
| Docker cleanup | After verified backups, with matching rollback holders | Unused images/cache older than 24 hours |

Daily times are 07:15 and 07:47 in Europe/Volgograd. Each offsite run also creates
a fresh local snapshot, so ten snapshots do not mean ten days. A temporary
eleventh exists during verification. Restic deduplicates data and bounds repacking
space; some reclaimable pack space can remain for later pruning. Docker volumes
are never pruned; images referenced by any container are preserved.

SQLite's official CLI `.backup` command captures a consistent standalone database,
including committed WAL changes, and `PRAGMA integrity_check` must pass. Snapshots include
the database, `.env`, active Compose/nginx configuration, TLS files, and container
metadata. Source is archived when the exact running revision is available in the
server checkout; recorded image metadata and Git history identify matching code.

The local repository is `/opt/triad-tactics/backups/restic`. Plaintext exists only
in private staging during capture and is cleaned afterward. Restic verifies data
before retention/pruning; locks coordinate repository operations and systemd
bounds backup runtime. Offsite uses standard `restic copy` over SFTP to:

```text
s3:https://de-s3.storage.bunnycdn.com/triad-tactics-com/triad-restic
```

A failed copy or verification prevents remote retention. The VPS timer continues
when GitHub or Bunny is unavailable. Enable Actions failure notifications and
check freshness: GitHub schedules can be delayed or disabled after prolonged
inactivity. Regional replication does not make backups immutable against account
compromise or deletion.

Useful VPS commands:

```bash
sudo systemctl start --wait triad-backup.service
sudo journalctl -u triad-backup.service --since yesterday
sudo systemctl list-timers triad-backup.timer
sudo env RESTIC_REPOSITORY=/opt/triad-tactics/backups/restic \
  RESTIC_PASSWORD_FILE=/etc/triad-backup/restic-password restic snapshots
```

## Recovery drill

Use a separate trusted Linux machine or ephemeral protected runner with restic,
Python, and enough disk space. Use private S3, not a CDN URL. Enter credentials
interactively so they do not enter shell history:

```bash
umask 077
export AWS_ACCESS_KEY_ID=triad-tactics-com AWS_DEFAULT_REGION=de
export RESTIC_REPOSITORY=s3:https://de-s3.storage.bunnycdn.com/triad-tactics-com/triad-restic
read -rsp 'Bunny Storage Zone Password: ' AWS_SECRET_ACCESS_KEY; echo
export AWS_SECRET_ACCESS_KEY
read -rsp 'Restic recovery password: ' RESTIC_PASSWORD; echo
export RESTIC_PASSWORD
restic --no-cache snapshots
restic --no-cache check --read-data
mkdir triad-restore-check
restic --no-cache restore latest --host triad-tactics --tag production \
  --target triad-restore-check
python3 - <<'PY'
from pathlib import Path
import sqlite3

database = Path('triad-restore-check/var/lib/triad-backup/staging/applications.db')
with sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True) as db:
    assert db.execute('PRAGMA integrity_check').fetchone() == ('ok',)
print('Restored database integrity: ok')
PY
unset AWS_SECRET_ACCESS_KEY RESTIC_PASSWORD
```

Inspect recovered metadata/configuration, then run the matching app against the
restored database in isolation with email and cron disabled. Repository checks do
not replace this application drill. Keep recovered secrets private and remove
the drill directory afterward. For production restoration, stop app and cron,
preserve the current database, restore the verified snapshot and matching app,
and fix ownership before starting. Never overwrite a live SQLite database or
mix restored data with stale WAL/SHM files.

## Validate operations changes

```bash
python -m pip install -r ops/requirements.txt
ansible-galaxy collection install -r ops/ansible/requirements.yml
ansible-lint ops/ansible/*.yml
shellcheck ops/setup-restic.sh ops/backup/*.sh
bash ops/backup/test-restic.sh
```

Ansible lint includes syntax validation. The synthetic backup test uses the
installed `sqlite3` CLI and restic binary. Actual first deployment, Bunny
interoperability, and application recovery remain migration acceptance checks.

## TLS (Let's Encrypt)

Certificates are issued and renewed by **certbot on the host** (not in Docker).
Nginx (in Docker) serves the ACME challenges from `/var/www/certbot` and reads
certs from `/etc/letsencrypt` (both host-mounted read-only).

### First-time setup

```bash
# 1. Install certbot
sudo apt update && sudo apt install -y certbot

# 2. Create the ACME challenge webroot
sudo mkdir -p /var/www/certbot

# 3. Issue the certificate.
#    If nginx is NOT running yet (fresh server), use standalone mode:
sudo certbot certonly --standalone -d triad-tactics.com \
  --agree-tos -m <your-email> --no-eff-email

#    If nginx IS already running with this repo's config, use webroot mode:
# sudo certbot certonly --webroot -w /var/www/certbot -d triad-tactics.com \
#   --agree-tos -m <your-email> --no-eff-email

# 4. Start/restart nginx
docker compose up -d --force-recreate nginx

# 5. If step 3 used standalone mode, switch renewals to webroot
#    (standalone renewal would fail because nginx occupies port 80):
sudo certbot certonly --webroot -w /var/www/certbot -d triad-tactics.com --force-renewal

# 6. Verify renewal works end-to-end
sudo certbot renew --dry-run
```

### Auto-renewal

Certbot installs a systemd timer (`systemctl list-timers | grep certbot`) that
renews automatically. Nginx must reload to pick up a renewed cert — add a deploy
hook (replace `/opt/triad-tactics` with the repo path on the server):

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null <<'EOF'
#!/bin/sh
cd /opt/triad-tactics && docker compose exec -T nginx nginx -s reload
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

## Notes
- Nginx listens on `80` and `443`; the Next.js app runs internally on `3000`.
- Steam sign-in uses `x-forwarded-host`/`x-forwarded-proto` from Nginx; keep the proxy config as-is.
- Admin is now protected by Steam login + allowlisted SteamID64s. Configure `ADMIN_STEAM_IDS` and visit `/<locale>/admin`.
- Outbox processing runs via the `/api/cron` endpoint, triggered by the `cron` container in `docker-compose.yml`.

## Canary email check

Use this to verify real delivery + content formatting in Brevo after changes to email templates.

1. Set the Brevo env vars (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`).
2. Set the canary env vars:
  - `CANARY_EMAIL_TO` (required)
  - `CANARY_EMAIL_NAME` (optional)
  - `CANARY_CALLSIGN` (optional)
  - `CANARY_LOCALE` (optional, defaults to `en`)
  - `CANARY_RENAME_REQUIRED` (`true`/`false`)
3. Run the canary script:

```bash
npm run canary:email
```

If you keep secrets in `.env.local`, run:

```bash
DOTENV_CONFIG_PATH=.env.local npm run canary:email
```

### Server Actions key stability

If you see Next.js errors like "Failed to find Server Action" in production (especially while self-hosting across multiple servers/instances), set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to a persistent value shared by all instances.

If you deploy on Vercel, consider enabling Skew Protection so assets/functions from the previous deployment remain available during rollout.

## Firewall (Ubuntu)

Expose only what you need publicly:
- `80/tcp` and `443/tcp` (Nginx)
- `22/tcp` (SSH)

Do **not** publish the Next.js app port (`3000`) to the internet. In `docker-compose.yml`, keep it internal (no `ports: "3000:3000"` on the `app` service).

### UFW example

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

sudo ufw enable
sudo ufw status verbose
```
