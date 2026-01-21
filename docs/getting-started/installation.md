# Installation Guide

OpenCodeHub allows you to host your own GitHub-like platform. You can run it via **Docker** (recommended for production) or **Node.js** (for development/custom setups).

## 📋 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 1 vCPU | 2 vCPU |
| **RAM** | 512MB | 2GB |
| **Disk** | 10GB | 50GB SSD |
| **OS** | Linux (Ubuntu/Debian) | Linux |

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

# Domain Configuration
SITE_URL=https://git.yourcompany.com
PORT=3000

# Database (Using the Postgres container defined in compose)
DATABASE_URL=postgresql://opencodehub:securepassword@postgres:5432/opencodehub

# Object Storage (Highly Recommended for Production)
STORAGE_TYPE=s3
STORAGE_BUCKET=my-git-bucket
STORAGE_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

### 4. Start Services

```bash
docker-compose up -d
```

### 5. Initialization

Initialize the admin user:
```bash
docker-compose exec app bun run scripts/seed-admin.ts
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
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## ✅ Production Checklist

Before going live to users:

- [ ] **Secrets Rotated**: Default secrets replaced with strong random strings.
- [ ] **HTTPS Enabled**: SSL certificate configured via Nginx/Caddy.
- [ ] **Rate Limiting**: `RATE_LIMIT_*` env vars adjusted for expected load.
- [ ] **Monitoring**: Grafana/Sentry configured for error tracking ([Guide](../administration/monitoring.md)).

---

## Next Steps

Now that you have OpenCodeHub up and running, let's look around:

👉 **[Quick Start Guide](quick-start.md)**
