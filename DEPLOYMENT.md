# Deployment (Docker + Nginx TLS)

## Publication readiness (what to verify)
- Set strong secrets:
  - `ADMIN_STEAM_IDS` must be set (comma/space separated SteamID64 allowlist)
  - `STEAM_WEB_API_KEY` must be set (Steam checks + submit depend on it)
  - `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` must be set (stable Server Actions across deploys/instances)
- Required email notifications (Brevo):
  - `BREVO_API_KEY` (Brevo API key)
  - `BREVO_SENDER_EMAIL` (verified sender in Brevo)
  - `BREVO_SENDER_NAME` (sender name)
  - `BREVO_REPLY_TO_EMAIL` (optional reply-to address)
- Outbox cron trigger:
  - `OUTBOX_CRON_SECRET` (shared secret used by cron container to call `/api/cron`)
  - `CRON_INTERVAL_SECONDS` (optional, defaults to 60)
- Production behavior:
  - `DISABLE_RATE_LIMITS=false`
- TLS:
  - Let's Encrypt via certbot on the host (webroot mode). See "TLS (Let's Encrypt)" below.
- Data:
  - SQLite DB is stored in a Docker volume (`db`). Back it up if you care about submissions.

## Files already in this repo
- `Dockerfile` (builds and runs Next.js)
- `docker-compose.yml` (app + nginx + cron)
- `nginx/default.conf` (TLS termination + proxy headers for Steam)
- `.env.example` (copy to `.env`)

## Runtime and dependency maintenance

Use the Node.js version pinned in `.nvmrc`; CI and all Docker stages use that
version, and `package.json` declares the supported Node 24 range. Keep these
files aligned when updating Node.

Use npm 11.19.1 or newer within npm 11 (bundled with the pinned Node release).
The package-specific `allowScripts` entry skips an unnecessary SQLite build:
`better-sqlite3` 13 includes native binaries, but npm can mistakenly run
`node-gyp` during a clean install ([upstream issue](https://github.com/WiseLibs/better-sqlite3/issues/1516)).
Other dependencies' install scripts remain enabled.

After changing dependencies, commit `package.json` and `package-lock.json`
together and run:

```bash
npm ci
npm audit --audit-level=low
npm run lint
npm run build
npm test
```

ESLint 10 uses the official `@eslint/compat` wrapper to adapt the older plugins
included by Next.js. TypeScript remains on version 6 because the current
lint/build tooling uses its JavaScript compiler API; revisit TypeScript 7 when
that tooling supports its new API.

CI audits npm dependencies and validates the production container. Renovate manages
routine dependency pull requests; GitHub Dependabot alerts, security updates, and
CodeQL remain enabled. Repository review and required checks gate updates. These
checks identify known issues; application security and host OS maintenance still
need their own review.

Production images are built and scanned in GitHub Actions, then pulled onto the
VPS by immutable GHCR digest. The VPS does not need to build images or retain a
build cache. A deployment accepts only the current `origin/main` commit and an
image carrying the matching OCI revision label. It refuses changes under
`src/platform/db`: schema changes require a reviewed manual migration and rollback
plan before deployment.

## Production backups, cleanup, and rollback

The host entrypoint is `scripts/deploy/triad_host.py`, installed as a reviewed,
root-owned copy at `/usr/local/lib/triad-deploy/triad_host.py`. Deployments cannot
replace this entrypoint themselves. Install a reviewed revision using:

```bash
sudo sh scripts/deploy/install.sh
sudo python3 /usr/local/lib/triad-deploy/triad_host.py maintain
sudo systemctl enable --now triad-maintenance.timer
```

The installer prints status and a dry run before cleanup. The timer creates a
verified backup daily at 04:15 UTC, with up to 15 minutes of randomized delay.
Each deployment also takes a backup before changing production containers. A
single host lock prevents deployments and backup jobs from overlapping.
The maintenance service keeps Docker CLI state in the private
`/var/lib/triad-maintenance/docker` directory, allowing build-cache cleanup while
`ProtectHome=true` keeps the root home directory inaccessible to the service.

The backup uses SQLite's online backup API in the running app, converts the
snapshot to a standalone database, runs `PRAGMA integrity_check`, and records its
SHA-256 checksum. The canonical file is:

```text
/opt/triad-tactics/backups/backups/applications-<UTC timestamp>.db
```

Its protected `backups/deployment-<UTC timestamp>/` bundle contains configuration,
the existing `.env`, image IDs, and a manifest. The database inside the bundle is
a hardlink to the canonical file, so it does not duplicate database storage.
Deployment backups additionally contain the previous source archive and host TLS
certificates; daily backups contain database and application configuration.

Cleanup retains the **10 newest verified snapshot sets**, grouping legacy copies
with the same timestamp across `backups/*.db`, `backups/backups/*.db`, deployment
bundles, and the Docker database volume's `backups/` directory. All copies of an
expired set are removed. Existing duplicates within retained legacy sets remain;
new backups use only one physical database copy. Unrecognized files and local
Windows copies are untouched. A missing fresh backup, corrupt retained database,
unexpected symlink, or insufficient disk space stops cleanup rather than risking
the remaining backups. A temporary eleventh backup exists while the new snapshot
is verified.

Stopped containers named `triad-tactics-rollback-app`, `-nginx`, and `-cron` protect
one previous known-good set of images. They are never started and have no database
mounts. After a successful rollout, the old running images become this rollback
set. Cleanup removes unused images belonging to this application, Nginx, or Alpine
and unused Docker build cache; it never removes volumes or images referenced by
any running or stopped container. The active and previous release configuration
directories are retained under `/opt/triad-tactics/.deploy/releases/`.

The deployer checks environment variables, the SQLite native module, Nginx
configuration, app readiness, HTTPS pages and JSON APIs, a JavaScript asset, the
HTTP redirect, and cron's curl installation. It verifies the resulting container
image IDs. A failed rollout restores prior images and configuration. **It does not
automatically restore the database**, because that would discard writes made
since the backup. A deliberate database restore requires stopping app and cron,
preserving the current database for recovery, and using a verified snapshot with
its matching application version.

Useful host commands:

```bash
sudo python3 /usr/local/lib/triad-deploy/triad_host.py status
sudo python3 /usr/local/lib/triad-deploy/triad_host.py --dry-run maintain
sudo python3 /usr/local/lib/triad-deploy/triad_host.py backup
sudo journalctl -u triad-maintenance.service --since yesterday
sudo systemctl list-timers triad-maintenance.timer
```

The CI SSH key must be dedicated to deployment, with this authorized-key prefix:

```text
restrict,command="/usr/bin/python3 /usr/local/lib/triad-deploy/triad_host.py ssh"
```

The only accepted SSH command is `deploy <40-character commit SHA>
sha256:<64-character digest>`. Standard input supplies one bounded JSON object
containing `username` and the workflow's short-lived registry `token`, followed by
EOF. Docker receives the token through standard input and uses a temporary private
configuration directory that is removed after pulling. No permanent registry PAT
is stored on the VPS. The workflow verifies the SSH host using a pinned
`known_hosts` entry. Do not grant this key an unrestricted shell.

Run the host safety tests on Linux without Docker or production credentials:

```bash
python3 -m unittest discover -s scripts/deploy -p 'test_*.py' -v
```

## Deploy on a fresh server (high level)
1. Put the repo on the server.
2. Create `.env` (same folder as `docker-compose.yml`) based on `.env.example` and set:
  - `STEAM_WEB_API_KEY=...`
  - `ADMIN_STEAM_IDS=...`
  - `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=...`
  - `OUTBOX_CRON_SECRET=...`
3. Set up TLS (see "TLS (Let's Encrypt)" below).
4. Start:
   - `docker compose up -d --build`

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
hook (replace `/opt/triad-tactics-com` with the repo path on the server):

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null <<'EOF'
#!/bin/sh
cd /opt/triad-tactics-com && docker compose exec -T nginx nginx -s reload
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
