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
  - `OUTBOX_CRON_SECRET` (shared secret used by cron container to call `/api/cron/outbox`)
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
- Outbox processing runs via the `/api/cron/outbox` endpoint, triggered by the `cron` container in `docker-compose.yml`.

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
