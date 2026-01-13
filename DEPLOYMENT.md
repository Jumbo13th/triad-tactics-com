# Deployment (Docker + Nginx TLS)

## Publication readiness (what to verify)
- Set strong secrets:
  - `ADMIN_PASSWORD` must be set (do not rely on the default)
  - `STEAM_WEB_API_KEY` must be set (Steam checks + submit depend on it)
  - `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` must be set (stable Server Actions across deploys/instances)
- Production behavior:
  - `DISABLE_RATE_LIMITS=false`
- TLS:
  - Provide valid certificate files: `certs/cert.crt` and `certs/key.key` (prefer full chain)
- Data:
  - SQLite DB is stored in a Docker volume (`db`). Back it up if you care about submissions.

## Files already in this repo
- `Dockerfile` (builds and runs Next.js)
- `docker-compose.yml` (app + nginx)
- `nginx/default.conf` (TLS termination + proxy headers for Steam)
- `.env.example` (copy to `.env`)

## Deploy on a fresh server (high level)
1. Put the repo on the server.
2. Create `.env` (same folder as `docker-compose.yml`) based on `.env.example` and set:
  - `STEAM_WEB_API_KEY=...`
  - `ADMIN_PASSWORD=...`
  - `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=...`
3. Place TLS files:
  - `certs/server.crt`
  - `certs/server.key`
4. Start:
   - `docker compose up -d --build`

## Notes
- Nginx listens on `80` and `443`; the Next.js app runs internally on `3000`.
- Steam sign-in uses `x-forwarded-host`/`x-forwarded-proto` from Nginx; keep the proxy config as-is.
- Admin is an API endpoint, not a UI: GET `/api/admin` with header `x-admin-password: <ADMIN_PASSWORD>`.

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
