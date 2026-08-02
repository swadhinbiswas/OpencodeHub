# OpenCodeHub — Free Deployment Options

> Deploy OpenCodeHub for free with persistent file storage for git repositories.

---

## Quick Comparison

| Platform | Cost | Storage | RAM | CPU | Best For |
|----------|------|---------|-----|-----|----------|
| **Oracle Cloud Free** | $0 forever | 200GB | 24GB | 4 ARM cores | Best overall |
| **Home Server/NAS** | $0 | Unlimited | Your hardware | Your hardware | Privacy-focused |
| **Fly.io** | $0 (limited) | 3GB free | 256MB | Shared | Quick testing |
| **Google Cloud Free** | $0 forever | 30GB | 1GB | 0.25 vCPU | Light usage |
| **Railway** | $5 trial | 1GB | 512MB | Shared | Quick demo |
| **Hetzner** | ~€4/mo | 40GB | 4GB | 2 vCPU | Best value paid |

---

## Option 1: Oracle Cloud Free Tier (Recommended)

**Always Free** — No credit card charge, no time limit.

### What You Get
- 4 ARM cores (Ampere A1)
- 24 GB RAM
- 200 GB boot volume
- 2 x 1TB block volumes (total 2TB)
- Free PostgreSQL database
- Free Redis

### Steps

```bash
# 1. Sign up at cloud.oracle.com
# 2. Create a VM instance:
#    - Name: opencodehub
#    - Image: Ubuntu 22.04
#    - Shape: VM.Standard.A1.Flex (4 OCPU, 24 GB RAM)
#    - Upload SSH key
#    - Create boot volume: 100 GB

# 3. SSH into your instance
ssh -i ~/.ssh/key ubuntu@YOUR_PUBLIC_IP

# 4. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 5. Install Docker Compose
sudo apt install docker-compose-plugin -y

# 6. Clone OpenCodeHub
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpencodeHub

# 7. Configure
cp .env.example .env
nano .env  # Edit secrets

# 8. Start
sudo docker compose up -d

# 9. Create admin
sudo docker compose exec app bun run scripts/seed-admin.ts
```

### Access Your Instance
```
Web:    http://YOUR_PUBLIC_IP:4321
SSH:    ssh://git@YOUR_PUBLIC_IP:2222/owner/repo.git
HTTPS:  Set up Nginx + Let's Encrypt (free)
```

---

## Option 2: Home Server / NAS

**$0 forever** — Use hardware you already own.

### What You Need
- Any computer running Linux/Mac/Windows
- 2GB+ RAM recommended
- 20GB+ free disk space

### Quick Start (Linux/Mac)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone and start
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpencodeHub
cp .env.example .env
nano .env  # Set secrets
docker compose up -d

# Create admin
docker compose exec app bun run scripts/seed-admin.ts
```

### NAS Deployment

**Synology / TrueNAS / QNAP:**
1. Install Docker from Package Center
2. Use Docker Compose or Portainer
3. Mount a shared folder for `/data`

### Access from Anywhere
- **Tailscale** (free): `tailscale up` → access via Tailscale IP
- **Cloudflare Tunnel** (free): Expose without opening ports
- **Port forwarding**: Open port 4321 on your router

---

## Option 3: Fly.io Free Tier

**Free** — 3GB persistent volume included.

### Steps

```bash
# 1. Install flyctl
curl -L https://fly.io/install.sh | sh

# 2. Login
fly auth login

# 3. Launch
fly launch --name opencodehub

# 4. Add persistent volume
fly volume create opencodehub_data --region sjc --size 3

# 5. Set secrets
fly secrets set JWT_SECRET=$(openssl rand -hex 32)
fly secrets set SESSION_SECRET=$(openssl rand -hex 32)
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set REDIS_URL="redis://..."

# 6. Deploy
fly deploy
```

### Limitations
- 3GB storage (enough for small repos)
- 256MB RAM (may be slow for large repos)
- Apps休眠 after inactivity (cold starts take ~30s)

---

## Option 4: Google Cloud Free Tier

**Always Free** — e2-micro instance.

### Steps

```bash
# 1. Sign up at cloud.google.com
# 2. Create e2-micro VM:
#    - Machine type: e2-micro (0.25 vCPU, 1GB RAM)
#    - Boot disk: 30GB SSD (free)
#    - Firewall: Allow HTTP (80), SSH (22)

# 3. SSH in and install Docker
ssh -i ~/.ssh/key USER@EXTERNAL_IP
sudo apt update && sudo apt install docker.io docker-compose-plugin -y

# 4. Deploy OpenCodeHub
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpencodeHub
cp .env.example .env
nano .env
docker compose up -d
```

### Limitations
- Only 1GB RAM (tight for production)
- 0.25 vCPU (slow builds)
- Good for personal/light use

---

## Option 5: Self-Hosted on Existing VPS

If you already have a VPS (Hetzner, DigitalOcean, Linode, etc.):

```bash
# SSH into your server
ssh root@YOUR_SERVER_IP

# One-line install
curl -fsSL https://raw.githubusercontent.com/swadhinbiswas/OpencodeHub/main/install.sh | bash
```

---

## Option 6: Docker on Windows/Mac

For local development or personal use:

```bash
# Install Docker Desktop for Windows/Mac
# https://docs.docker.com/get-docker/

# Clone and start
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpencodeHub
cp .env.example .env
nano .env
docker compose up -d

# Create admin
docker compose exec app bun run scripts/seed-admin.ts
```

---

## Storage Configuration

### Local Storage (Default)
```bash
STORAGE_TYPE=local
STORAGE_PATH=/data/storage
GIT_REPOS_PATH=/data/repositories
```

### S3-Compatible (MinIO on same server)
```bash
# Add to docker-compose.yml:
minio:
  image: minio/minio
  command: server /data --console-address ":9001"
  volumes:
    - ./data/minio:/data
  ports:
    - "9001:9001"

STORAGE_TYPE=s3
STORAGE_ENDPOINT=http://minio:9000
STORAGE_BUCKET=opencodehub
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
```

---

## HTTPS Setup (Free)

### With Let's Encrypt + Nginx

```bash
# Install Nginx and Certbot
sudo apt install nginx certbot python3-certbot-nginx -y

# Create Nginx config
sudo nano /etc/nginx/sites-available/opencodehub
```

```nginx
server {
    listen 80;
    server_name git.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name git.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/git.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/git.yourdomain.com/privkey.pem;

    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:4321;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /api/realtime {
        proxy_pass http://localhost:4321;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# Enable and get SSL
sudo ln -s /etc/nginx/sites-available/opencodehub /etc/nginx/sites-enabled/
sudo certbot --nginx -d git.yourdomain.com
```

---

## Environment Variables (Production)

```bash
# Generate all secrets
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
INTERNAL_HOOK_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 32)
RUNNER_SECRET=$(openssl rand -hex 32)
AI_CONFIG_ENCRYPTION_KEY=$(openssl rand -hex 32)
WORKFLOW_SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Your .env file
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://opencodehub:PASSWORD@localhost:5432/opencodehub
DATABASE_SSL=false
REDIS_URL=redis://localhost:6379
SITE_URL=https://git.yourdomain.com
STORAGE_TYPE=local
GIT_REPOS_PATH=/data/repositories
NODE_ENV=production
```

---

## Backup Strategy

### Automated Backup Script
```bash
#!/bin/bash
# backup.sh — Run daily via cron
BACKUP_DIR="/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# Database dump
docker compose exec -T postgres pg_dump -U opencodehub opencodehub > "$BACKUP_DIR/db.sql"

# Git repos
tar czf "$BACKUP_DIR/repos.tar.gz" ./data/repositories/

# Upload to S3 (optional)
# aws s3 sync "$BACKUP_DIR" s3://your-backup-bucket/opencodehub/
```

### Cron Job
```bash
# Add to crontab
crontab -e
0 2 * * * /path/to/backup.sh
```

---

## Monitoring

### Health Check
```bash
# Check if app is running
curl -f http://localhost:4321/api/health || echo "DOWN"

# Check Docker status
docker compose ps
docker compose logs --tail=50 app
```

### Uptime Robot (Free)
1. Sign up at uptimerobot.com
2. Add HTTP monitor: `http://YOUR_IP:4321/api/health`
3. Get notified if your instance goes down

---

## Recommended Free Setup

For a **personal Git server** that stores all your code:

| Component | Choice |
|-----------|--------|
| **Cloud** | Oracle Cloud Free Tier |
| **Server** | ARM A1 (4 cores, 24GB RAM) |
| **Storage** | 100GB boot + 1TB block volume |
| **Database** | PostgreSQL (Docker) |
| **Cache** | Redis (Docker) |
| **HTTPS** | Nginx + Let's Encrypt |
| **Access** | Tailscale (private) or port forwarding |
| **Backups** | Cron script + local S3 |

**Total cost: $0/month forever.**

---

*Generated for OpenCodeHub free deployment.*
