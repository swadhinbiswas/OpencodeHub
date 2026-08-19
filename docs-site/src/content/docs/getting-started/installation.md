---
title: "Installation Guide"
---

OpenCodeHub is a self-hosted Git platform. You can run it via **Docker** (recommended) or **Node.js** (for development).

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 1 vCPU | 2 vCPU |
| **RAM** | 512MB | 2GB |
| **Disk** | 10GB | 50GB SSD |
| **OS** | Linux (Ubuntu/Debian) | Linux |

## CLI Installation (`opencodehub-cli`)

Install the official OpenCodeHub CLI (`och`) to manage stacks, pull requests, and merge queues from your terminal:

```bash
# via npm
npm install -g opencodehub-cli

# via bun
bun add -g opencodehub-cli

# via pnpm
pnpm add -g opencodehub-cli

# via yarn
yarn global add opencodehub-cli
```

Verify your installation:

```bash
och --version
och --help
```

---

## 1-Click Installation (Recommended)

```bash
curl -sSL https://raw.githubusercontent.com/swadhinbiswas/OpencodeHub/main/install.sh | bash
```

The script will:
1. Ensure Docker and Docker Compose are installed
2. Clone the latest stable release
3. Configure a unified `DATA_DIR` for databases, git repos, and storage
4. Prompt you to create an initial admin user

## Manual Docker Setup

```bash
# Clone
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpencodeHub

# Configure
cp .env.example .env
# Edit .env — at minimum, change all secrets!

# Start
docker-compose up -d

# Create admin user
docker-compose exec app bun run scripts/seed-admin.ts
```

The app runs on **port 4321** (HTTP) and **port 2222** (SSH git).

:::caution[Change Secrets]
Before going live, generate new secrets for all `*_SECRET` and `*_KEY` variables:
```bash
openssl rand -base64 32
```
:::

## Docker Compose Services

| Service | Port | Purpose |
|---------|------|---------|
| `app` | 4321, 2222 | Main application + SSH git |
| `postgres` | 5432 | PostgreSQL database |
| `redis` | 6379 | Redis cache/queues |
| `runner` | — | CI/CD Docker runner |

## Nginx Reverse Proxy (SSL)

In production, use HTTPS. Standard Nginx config:

```nginx
server {
    listen 80;
    server_name git.yourcompany.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name git.yourcompany.com;

    ssl_certificate /etc/letsencrypt/live/git.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/git.yourcompany.com/privkey.pem;

    # Important for Git operations
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:4321;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

See [Nginx Deployment](/administration/deploy-nginx/) for the full config with WebSocket support and Git optimizations.

## SSH Git Access

The SSH git server starts automatically on port 2222. Clone with:

```bash
git clone ssh://git@your-server:2222/owner/repo.git
```

The host key is auto-generated at `GIT_SSH_HOST_KEY` on first start.

## Node.js Setup (Development)

```bash
# Install dependencies
npm install

# Configure
cp .env.example .env

# Push schema to database
npm run db:push

# Create admin user
bun run scripts/seed-admin.ts

# Start dev server
npm run dev
```

See [Local Dev Setup](/development/local-dev-setup/) for details.

## Production Checklist

Before going live:

- [ ] All secrets rotated (JWT_SECRET, SESSION_SECRET, INTERNAL_HOOK_SECRET, etc.)
- [ ] HTTPS enabled via Nginx/Caddy
- [ ] PostgreSQL used (not SQLite)
- [ ] Redis configured for distributed locking
- [ ] Rate limiting enabled (`RATE_LIMIT_ENABLED=true`)
- [ ] Email configured (SMTP) for notifications
- [ ] Storage backend configured (S3 recommended for multi-node)
- [ ] Backup strategy configured
- [ ] Monitoring set up (see [Monitoring](/administration/monitoring/))

## Next Steps

- **[Quick Start Guide](/getting-started/quick-start/)** — Navigate the dashboard and create your first repo
- **[Configuration Reference](/administration/configuration/)** — All environment variables
- **[Docker Deployment](/administration/deploy-docker/)** — Production Docker setup
