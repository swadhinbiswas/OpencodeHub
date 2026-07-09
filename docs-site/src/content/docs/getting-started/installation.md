---
title: "Installation Guide"
---


OpenCodeHub allows you to host your own GitHub-like platform. You can run it via **Docker** (recommended for production) or **Node.js** (for development/custom setups).

## 📋 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 1 vCPU | 2 vCPU |
| **RAM** | 512MB | 2GB |
| **Disk** | 10GB | 50GB SSD |
| **OS** | Linux (Ubuntu/Debian) | Linux |

---

## ⚡ 1-Click Installation (Recommended)

The easiest way to install OpenCodeHub on a VPS, NAS, or edge device is using the automated installation script. This script automatically handles Docker setup, environment variables, database generation, and configuring the unified `DATA_DIR`.

```bash
curl -sSL https://raw.githubusercontent.com/swadhinbiswas/OpencodeHub/main/install.sh | bash
```

The script will:
1. Ensure Docker and Docker Compose are installed.
2. Clone the latest stable release.
3. Automatically configure a unified `/data` mount point (`DATA_DIR`) for all your databases, git repos, and storage to easily enable painless backups.
4. Prompt you to create an initial Admin user account.

### Manual Setup (Advanced)

If you prefer to configure Docker Compose manually:

1. Clone the repository:
```bash
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub
```

2. Configure environment:
```bash
cp .env.example .env
```
Open `.env` and set your `DATA_DIR` (e.g., `DATA_DIR=/home/user/opencodehub-data`). The system will automatically map the database, SSH keys, git repositories, and object storage paths to this unified folder.

3. Start services:
```bash
docker-compose up -d
```

4. Initialize the database and admin user:
```bash
bun run scripts/seed-admin.ts
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
