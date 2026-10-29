# Deployment

One VM, managed by [Kamal](https://kamal-deploy.org). Config: `config/deploy.yml`,
`config/litestream.yml`, `config/observability/`. Secret values live in GitHub only.

## Deploy

Every green push to `main` deploys automatically. Set the repository variable `AUTO_DEPLOY`
to anything but `true` to pause.

Manual: **Actions → Production → Run workflow** on `main`.

| Command | Use |
| --- | --- |
| `deploy` | Deploy a commit (default: head of `main`) |
| `rollback` | Return to an earlier commit SHA (last 3 releases are kept) |
| `reboot-accessories` | Apply accessory config changes |
| `setup` | First run on a new VM |

- Pause `AUTO_DEPLOY` before a rollback, or the next merge redeploys the bad commit.
- Keep migrations additive: old and new containers share the database during a deploy.

## Secrets

Environment `production` (main only):
- Variable `DEPLOY_HOST`
- `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`
- App: `STEAM_WEB_API_KEY`, `ADMIN_STEAM_IDS`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`,
  `OUTBOX_CRON_SECRET`, `GAMESERVER_API_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
  `DISCORD_BOT_TOKEN`, `DISCORD_REDIRECT_URI`, `DISCORD_GUILD_ID`, `DISCORD_CONFIRMED_ROLE_ID`,
  `DISCORD_TOKEN_ENCRYPTION_KEY`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`,
  `BREVO_REPLY_TO_EMAIL`
- `LITESTREAM_SECRET_ACCESS_KEY` (Bunny zone password), `ALERT_DISCORD_WEBHOOK_URL`

Repository: variable `AUTO_DEPLOY`, secret `LITESTREAM_READONLY_PASSWORD`.

## Backups

Litestream streams the database to Bunny Storage zone `triad-tactics-com` (point-in-time
restore, 30 days). **Backup restore check** verifies a restore every Monday.

Restore on the running VM:

```bash
read -rs LITESTREAM_SECRET_ACCESS_KEY && export LITESTREAM_SECRET_ACCESS_KEY
docker stop triad-tactics-litestream
# Optional: -timestamp 2026-10-30T12:00:00Z before the last argument.
docker run --rm --user 1001:1001 --volumes-from triad-tactics-litestream \
  -e LITESTREAM_SECRET_ACCESS_KEY litestream/litestream:0.5.17 \
  restore -o /data/restored.db /data/applications.db
docker stop $(docker ps -q --filter label=service=triad-tactics --filter label=role=web) \
  $(docker ps -q --filter label=service=triad-tactics --filter label=role=cron)
docker run --rm --user 1001:1001 -v triad-tactics_db:/data alpine sh -c '
  mkdir -p /data/pre-restore &&
  mv /data/applications.db* /data/.applications.db-litestream /data/pre-restore/ 2>/dev/null
  mv /data/restored.db /data/applications.db'
```

Then run **Production → deploy**.

New VM:
1. Install Docker; create user `deploy` in group `docker` with the public half of
   `DEPLOY_SSH_KEY`; allow only ports 22, 80, 443.
2. `/etc/docker/daemon.json`, then restart Docker:
   `{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }`
3. Point DNS at the VM; update `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS`.
4. Restore the database (copy `config/litestream.yml` to the VM first):
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

Alerts go to Discord. Dashboards and logs are reachable through an SSH tunnel only:

```bash
ssh -N -L 8428:127.0.0.1:8428 -L 9428:127.0.0.1:9428 <user>@<host>
```

- Dashboard: http://127.0.0.1:8428/vmui/#/dashboards
- Alerts: http://127.0.0.1:8428/vmalert/
- Logs: http://127.0.0.1:9428/select/vmui/

## Canary email

```bash
DOTENV_CONFIG_PATH=.env.local npm run canary:email
```

Needs `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` and `CANARY_EMAIL_TO`; optional
`CANARY_EMAIL_NAME`, `CANARY_CALLSIGN`, `CANARY_LOCALE`, `CANARY_RENAME_REQUIRED`.
