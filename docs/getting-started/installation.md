# Installation Guide

OpenCodeHub allows you to host your own GitHub-like platform. You can run it via **Docker** (recommended for production) or **Node.js / Bun** (for development/custom setups).

## 📋 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 1 vCPU | 2 vCPU |
| **RAM** | 512MB | 2GB |
| **Disk** | 10GB | 50GB SSD |
| **OS** | Linux (Ubuntu/Debian) | Linux / macOS / Windows |

---

## 💻 CLI Installation (`opencodehub-cli`)

Install the official OpenCodeHub CLI (`och`) to interact with your instance directly from the terminal:

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

Verify the CLI is ready:

```bash
och --version
och --help
```

Authenticate with your server:

```bash
och auth login --url https://git.yourcompany.com
och config doctor
```

---

## 🐳 Docker Production Setup

This is the most robust way to deploy OpenCodeHub.

### 1. Structure Setup

Create a directory for your deployment:

```bash
mkdir opencodehub && cd opencodehub
mkdir -p data/postgres data/redis data/storage
```

### 2. Configuration Files

Download the production compose file:

```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/swadhinbiswas/OpencodeHub/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/swadhinbiswas/OpencodeHub/main/.env.example
```

### 3. Environment Configuration

Edit `.env` and set **production values**.

```bash
# Critical Security (Generate new keys!)
JWT_SECRET=<openssl rand -hex 32>
SESSION_SECRET=<openssl rand -hex 32>
INTERNAL_HOOK_SECRET=<openssl rand -hex 32>
CRON_SECRET=<openssl rand -hex 32>
RUNNER_SECRET=<openssl rand -hex 32>

# Domain Configuration
SITE_URL=https://git.yourcompany.com
PORT=4321

# Database (Using the Postgres container defined in compose)
DATABASE_URL=postgresql://opencodehub:securepassword@postgres:5432/opencodehub
POSTGRES_USER=opencodehub
POSTGRES_PASSWORD=securepassword
POSTGRES_DB=opencodehub

# Redis
REDIS_URL=redis://:redispassword@redis:6379
REDIS_PASSWORD=redispassword

# Object Storage (Optional for S3 backends)
STORAGE_TYPE=local
STORAGE_PATH=/data/storage
```

### 4. Start Services

```bash
docker compose up -d
```

### 5. Initialization

Initialize the admin user:
```bash
docker compose exec app bun scripts/seed-admin.ts
```

---

## 🛠 Nginx Reverse Proxy (SSL)

In production, you **must** use HTTPS. Here is a standard Nginx configuration.

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
        proxy_pass http://127.0.0.1:4321;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```
