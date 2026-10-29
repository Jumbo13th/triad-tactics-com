# Deployment

The site runs on one VM as Docker containers managed by [Kamal](https://kamal-deploy.org):

- **web** — the Next.js app behind kamal-proxy. The proxy terminates TLS (Let's Encrypt,
  renewed automatically) and switches traffic to a new container only after its
  `/api/health` passes, so a broken release never receives requests.
- **cron** — the same image running `scripts/cron.mjs`, which calls `/api/cron` every minute.
- **Accessories** — Litestream (database backup to Bunny Storage), VictoriaMetrics,
  node-exporter, vmalert and Alertmanager (metrics and Discord alerts), VictoriaLogs and
  Vector (logs).

Configuration lives in `config/deploy.yml`, `config/litestream.yml` and
`config/observability/`. `.kamal/secrets` only names the secrets; their values are in GitHub.

## Deploying

Every push to `main` that passes CI is built once, pushed to GHCR as
`ghcr.io/jumbo13th/triad-tactics-com:<commit>`, and deployed by the **Production** workflow:
`kamal deploy`, then a reboot of the accessories so their config matches the same commit.
Set the repository variable `AUTO_DEPLOY` to anything other than `true` to pause this.

Manual operations: **Actions → Production → Run workflow** on `main`.

| Command | Use |
| --- | --- |
| `deploy` | Deploy a commit (defaults to the head of `main`) |
| `rollback` | Switch back to an earlier commit (its SHA is required); the VM keeps the last three releases |
| `reboot-accessories` | Apply accessory config without redeploying the app |
| `setup` | First run on a new VM: boots kamal-proxy and every accessory, then deploys |

Before a rollback, set `AUTO_DEPLOY` to `false`: otherwise the next merge to `main` deploys the
bad commit again, and a queued automatic deploy can replace a pending manual run. Fix or revert
on `main`, then turn it back on.

Migrations run when the app starts, and old and new containers share the database for a few
seconds during each switch. Keep migrations additive: add tables and columns, and drop old
ones only in a later release.

## Secrets and settings

GitHub environment **production** (deployments restricted to `main`):

| Name | Type | Purpose |
| --- | --- | --- |
| `DEPLOY_HOST` | Variable | VM hostname or IP |
| `DEPLOY_SSH_KEY` | Secret | Private key of the VM's `deploy` user |
| `DEPLOY_KNOWN_HOSTS` | Secret | The VM's host key line (`ssh-keyscan -t ed25519 <host>`, verified out of band) |
| `STEAM_WEB_API_KEY`, `ADMIN_STEAM_IDS`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `OUTBOX_CRON_SECRET`, `GAMESERVER_API_SECRET` | Secrets | App settings (`scripts/checkRequiredEnv.mjs` lists the required ones) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_REDIRECT_URI`, `DISCORD_GUILD_ID`, `DISCORD_CONFIRMED_ROLE_ID`, `DISCORD_TOKEN_ENCRYPTION_KEY` | Secrets | Discord integration |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_REPLY_TO_EMAIL` | Secrets | Email |
| `LITESTREAM_SECRET_ACCESS_KEY` | Secret | Bunny storage zone password (write) |
| `ALERT_DISCORD_WEBHOOK_URL` | Secret | Discord channel webhook for alerts |

Repository level: variable `AUTO_DEPLOY` (`true` to deploy automatically) and secret
`LITESTREAM_READONLY_PASSWORD` (the zone's read-only password, for the restore check).

`gh secret set --env production -f production.env` imports a whole dotenv file at once.
Keep `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` stable across deploys, or open pages fail with
"Failed to find Server Action".

## Backups

Litestream streams every database change to the Bunny storage zone `triad-tactics-com`
(Frankfurt, S3 API, created with S3 enabled) under `litestream/`. It takes a snapshot daily,
so the database can be restored to any point in the last 30 days. The zone holds plain SQLite
pages: Litestream does not encrypt. Discord tokens are encrypted by the app with a key that
is not in the backup.

The **Backup restore check** workflow restores the latest backup every Monday with the
read-only password and runs `PRAGMA integrity_check`.

### Restore on the running VM

```bash
read -rs LITESTREAM_SECRET_ACCESS_KEY && export LITESTREAM_SECRET_ACCESS_KEY  # read-only password
docker stop triad-tactics-litestream
# Add -timestamp 2026-10-30T12:00:00Z before the last argument for an earlier point in time.
docker run --rm --user 1001:1001 --volumes-from triad-tactics-litestream \
  -e LITESTREAM_SECRET_ACCESS_KEY litestream/litestream:0.5.17 \
  restore -o /data/restored.db /data/applications.db
docker stop $(docker ps -q --filter label=service=triad-tactics --filter label=role=web) \
  $(docker ps -q --filter label=service=triad-tactics --filter label=role=cron)
# Keep the replaced database (and Litestream's position for it) instead of deleting it.
docker run --rm --user 1001:1001 -v triad-tactics_db:/data alpine sh -c '
  mkdir -p /data/pre-restore &&
  mv /data/applications.db* /data/.applications.db-litestream /data/pre-restore/ 2>/dev/null
  mv /data/restored.db /data/applications.db'
```

Then run **Production → deploy**: it starts the app and reboots Litestream on the restored file.

### New VM

1. Install Docker. Create a `deploy` user in the `docker` group whose `authorized_keys` holds
   the public half of `DEPLOY_SSH_KEY`. Disable root and password SSH logins, allow only
   22, 80 and 443 inbound, and enable `unattended-upgrades`.
2. Cap container logs in `/etc/docker/daemon.json`, then restart Docker:
   ```json
   { "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
   ```
3. Point the DNS record at the VM; update `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS`.
4. Restore the database into a new volume (copy `config/litestream.yml` to the VM first):
   ```bash
   read -rs LITESTREAM_SECRET_ACCESS_KEY && export LITESTREAM_SECRET_ACCESS_KEY
   docker volume create triad-tactics_db
   docker run --rm -v triad-tactics_db:/data alpine chown 1001:1001 /data
   docker run --rm --user 1001:1001 -e LITESTREAM_SECRET_ACCESS_KEY \
     -v triad-tactics_db:/data -v "$HOME/litestream.yml:/etc/litestream.yml:ro" \
     litestream/litestream:0.5.17 restore /data/applications.db
   ```
5. Run **Production → setup**.

## Monitoring

- **Uptime:** an external monitor checks `https://triad-tactics.com/api/health`. It is the
  alert that still works when the VM itself is down.
- **Backup freshness:** the `BackupStale` alert fires when the database changed but nothing
  reached Bunny for an hour, or nothing was uploaded for 26 hours (the daily snapshot always
  uploads). The restore check proves a backup restores, not that it is recent.
- **Alerts:** vmalert rules in `config/observability/alerts.yml` (disk, memory, backup
  errors and staleness, 5xx rate, silent scrape targets) post to Discord through Alertmanager.
  If the monitoring containers themselves stop, nothing alerts; the dashboards show it.
- **Dashboards and logs** listen on the VM's loopback only. Open a tunnel:
  ```bash
  ssh -N -L 8428:127.0.0.1:8428 -L 9428:127.0.0.1:9428 <user>@<host>
  ```
  Metrics dashboard "Website": `http://127.0.0.1:8428/vmui/#/dashboards`; alert state:
  `http://127.0.0.1:8428/vmalert/`; logs: `http://127.0.0.1:9428/select/vmui/`. Query strings
  containing `secret=` are redacted before logs are stored.

## Dependency updates

Renovate opens updates on Mondays between 01:00 and 07:00 UTC once a release is three days
old, and merges minor, patch and digest updates itself in the same window on weekdays once CI
passes — which deploys them. A person reviews everything else: GitHub Actions, Kamal, Trivy and
the accessory images (pinned by digest; they hold the Docker socket, the host filesystem, the
database or the Bunny key), the weekly lock-file refresh (release age cannot apply to it), and
major versions, which start from the Dependency Dashboard. Renovate opens security fixes
immediately; it reads Dependabot alerts, so keep those enabled.

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
