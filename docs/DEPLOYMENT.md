# Deploying to Hetzner Cloud

The site runs on a single low-cost Hetzner Cloud server as two Docker
containers: the Next.js app and a [Caddy](https://caddyserver.com/) reverse
proxy that handles HTTPS automatically. GitHub Actions builds the Docker image
and triggers the server to pull and restart it on every push to `main`.

```
push to main ──▶ GitHub Actions ──▶ build image ──▶ push to ghcr.io
                                          │
                                          ▼
                              SSH into Hetzner server
                              docker compose pull && up -d
```

Total cost: ~€5/month (smallest CX server + IPv4).

## 1. Create the server

1. In the [Hetzner Cloud console](https://console.hetzner.cloud/), create a
   project and add a server: smallest shared CX instance, and under
   **Image → Apps** pick **Docker CE** (Ubuntu LTS with Docker
   preinstalled).
2. Add your **personal SSH key** — this is for logging in as root. (The
   deploy key GitHub Actions uses is a separate one, generated in the next
   step.)
3. Paste this into the **Cloud config** (user data) field. It runs once on
   first boot and replaces the manual server preparation below:

   ```yaml
   #cloud-config
   users:
     - name: deploy
       groups: docker
       shell: /bin/bash

   runcmd:
     - mkdir -p /home/deploy/.ssh /opt/fff-website
     - chown deploy:deploy /home/deploy/.ssh /opt/fff-website
     - chmod 700 /home/deploy/.ssh
     # Generate the SSH key that GitHub Actions will deploy with
     - sudo -u deploy ssh-keygen -t ed25519 -N "" -f /home/deploy/.ssh/id_deploy
     - sudo -u deploy sh -c 'cat /home/deploy/.ssh/id_deploy.pub >> /home/deploy/.ssh/authorized_keys'
     - chmod 600 /home/deploy/.ssh/authorized_keys
   ```

   Note: `groups: docker` works because the Docker CE image has Docker (and
   its group) baked in before first boot. On a plain Ubuntu image, create
   the user manually instead (see below).
4. Under **Firewalls**, create a firewall allowing inbound TCP **22, 80, 443**
   only, and apply it to the server.

### DNS (e.g. Cloudflare)

Point an **A record** for your domain (e.g. `fff.example.com`) at the
server's IP and wait until `dig +short fff.example.com` returns it.

With Cloudflare specifically, set the record to **DNS only** (grey cloud).
Caddy then obtains Let's Encrypt certificates itself and nothing else needs
configuring. Proxied mode (orange cloud) also works — set SSL/TLS to
**Full (strict)** in Cloudflare — but it hides real client IPs from the app
unless you additionally configure Caddy's `trusted_proxies` with
Cloudflare's IP ranges. For a private friends' site, DNS-only is the simple,
recommended choice.

## 2. Prepare the server (one-time)

**If you used the cloud-init config above**, the server is already prepared.
SSH in as root once to print the deploy key (you'll need it in step 4):

```bash
ssh root@<server-ip> cat /home/deploy/.ssh/id_deploy
```

**Otherwise** (plain Ubuntu image, no user data), SSH in as root and run:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Create a deploy user that GitHub Actions will SSH in as
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy

# Give the deploy user its own SSH key for GitHub Actions
sudo -u deploy mkdir -p -m 700 /home/deploy/.ssh
sudo -u deploy ssh-keygen -t ed25519 -N "" -f /home/deploy/.ssh/id_deploy
sudo -u deploy sh -c 'cat /home/deploy/.ssh/id_deploy.pub >> /home/deploy/.ssh/authorized_keys'
cat /home/deploy/.ssh/id_deploy        # <- save this private key for step 4

# App directory
mkdir -p /opt/fff-website
chown deploy:deploy /opt/fff-website
```

Copy the deploy bundle to the server (from your machine, in the repo root):

```bash
scp deploy/docker-compose.yml deploy/Caddyfile deploy/.env.example deploy@<server-ip>:/opt/fff-website/
ssh deploy@<server-ip> 'cd /opt/fff-website && mv .env.example .env'
```

Then edit `/opt/fff-website/.env` on the server and fill in every value
(`SITE_DOMAIN`, `AUTH_SECRET` via `openssl rand -base64 32`, `AUTH_URL`, and
the `INITIAL_ADMIN_*` account).

### Registry access

The image lives in the GitHub Container Registry. If the repository (and
therefore the package) is private, the server needs a read token once:
create a GitHub **classic PAT** with only `read:packages`, then on the server:

```bash
docker login ghcr.io -u <your-github-username>   # paste the PAT as password
```

## 3. First start

```bash
ssh deploy@<server-ip>
cd /opt/fff-website
docker compose pull && docker compose up -d
docker compose logs -f app   # watch migrations + admin bootstrap run
```

Visit `https://your-domain` — Caddy fetches a certificate on the first
request. Log in with the `INITIAL_ADMIN_*` credentials, change the password on
the profile page, and add your friends from the **Admin** page.

## 4. Wire up CI/CD

In the GitHub repo, add three **Actions secrets**
(Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Server IP or hostname |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | The private key printed in step 2 (`id_deploy`) |

From then on, every push to `main`:

1. `deploy.yml` builds the image and pushes `ghcr.io/menialfob/fff-website:latest`
   (plus a per-commit SHA tag for rollbacks).
2. SSHes to the server and runs `docker compose pull && docker compose up -d`.

Migrations run automatically when the app container starts.

**Rollback:** on the server, edit the image tag in `docker-compose.yml` to a
previous commit SHA and `docker compose up -d`.

### Staging environment (`test.<domain>`)

`staging.yml` gives you a live copy of the site to test a branch before merging
to `main` — no manual SSH, only a one-time DNS record. It's built for solo,
one-branch-at-a-time work: every push to a **non-`main`** branch rebuilds the
`:staging` image and refreshes a single `app-staging` container served at
`test.<your-domain>` (e.g. `test.fff.example.com`).

How it stays hands-off:

- Both workflows now `scp` `docker-compose.yml` and `Caddyfile` to the server
  before restarting, so those files are driven from the repo — edit them here,
  push, done. (Before, they were only ever placed on the server by hand.)
- The deploy step derives `.env.staging` from the server's `.env`, overriding
  only `SITE_DOMAIN`/`AUTH_URL` to `test.<domain>`. Staging reuses production's
  `AUTH_SECRET` and `INITIAL_ADMIN_*`; no extra secrets to manage.
- `app-staging` uses its own `app-staging-data` volume, so staging has a
  **separate database and uploads** — production data is never touched. The
  first push seeds a fresh admin from `INITIAL_ADMIN_*`.

**One-time setup:** add an **A record** for `test.<your-domain>` pointing at the
same server IP, set to **DNS only (grey cloud)** like the main record. Nothing
else — the existing `DEPLOY_*` secrets and firewall ports (80/443) already
cover it. Then push any branch and visit `https://test.<your-domain>`.

Notes:

- The staging database persists across branches. A branch that changes
  `prisma/schema.prisma` migrates that shared DB on startup; if you switch
  between branches with divergent schemas and hit a migration conflict, reset
  it with `docker compose down app-staging && docker volume rm
  fff-website_app-staging-data`, then push again.
- The **Spotify per-user connect flow won't work on staging** unless you also
  add `https://test.<domain>/api/spotify/callback` as a Redirect URI in the
  Spotify dashboard (§5). Track search still works.

## 5. Spotify (Klub 100)

Two integrations share one Spotify app
([dashboard](https://developer.spotify.com/dashboard)): server-side track
search (`SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` in the server `.env`) and
the per-user connect flow that lets a member host live Klub 100 playback.
The app stays in development mode permanently (extended quota is unavailable
to hobby apps), which imposes two rules — see `docs/klub100-prd.md` §6.3:

- **Redirect URI** — add `https://<your-domain>/api/spotify/callback` under
  the app's settings → Redirect URIs. Without it the connect flow fails with
  `INVALID_CLIENT: Invalid redirect URI`. (For local dev, also add
  `http://127.0.0.1:3000/api/spotify/callback` and set
  `SPOTIFY_REDIRECT_URI` accordingly — Spotify rejects `http://localhost`.)
- **User allowlist (max 5)** — every member who connects their Spotify
  account must first be added under the app's **User Management** with the
  email of their Spotify account. Only 5 slots exist and only playback
  *hosts* need one (search/suggest/vote need no slot), so coordinate in the
  group chat before adding anyone. Removing an entry in the dashboard frees
  the slot; the member should also hit "Disconnect" on the Klub 100 page so
  the site's count stays honest.

Hosting playback additionally requires the connected account to have
**Spotify Premium** (a Feb 2026 platform rule; the UI explains this).

## 6. Backups

Everything that matters (SQLite database + all uploads) lives in the single
`app-data` Docker volume. A simple nightly dump:

```bash
# /etc/cron.daily/backup-fff (chmod +x)
#!/bin/sh
docker run --rm -v fff-website_app-data:/data:ro -v /root/backups:/backup \
  alpine tar czf /backup/fff-$(date +%F).tar.gz -C /data .
find /root/backups -name 'fff-*.tar.gz' -mtime +14 -delete
```

For off-server backups, add a cheap [Hetzner Storage Box](https://www.hetzner.com/storage/storage-box/)
and sync the backup directory to it with `rclone` or `restic`.

## Scaling notes

This setup (SQLite + local disk) is deliberately simple and is plenty for a
small friend group. If the group or traffic grows: swap SQLite for Postgres
(one more compose service; Prisma makes the migration straightforward) and
move uploads to Hetzner Object Storage (S3-compatible).
