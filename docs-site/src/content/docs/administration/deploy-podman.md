---
title: "Deploy with Podman"
description: "Deploy OpenCodeHub using Podman as a rootless, daemonless Docker alternative"
---

Podman is a drop-in replacement for Docker that runs without a daemon and supports rootless containers. This guide covers deploying OpenCodeHub with Podman.

## Why Podman?

| Feature | Docker | Podman |
|---------|--------|--------|
| Daemon | Required | Daemonless |
| Root access | Required by default | Rootless by default |
| Systemd integration | Limited | Native |
| Security | Good | Better (no root daemon) |
| CLI compatibility | Native | Docker-compatible |

---

## Prerequisites

```bash
# Install Podman (Ubuntu/Debian)
sudo apt update
sudo apt install -y podman podman-compose

# Install Podman (Fedora/RHEL/CentOS)
sudo dnf install -y podman podman-compose

# Verify installation
podman --version
podman-compose --version
```

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub

# Copy environment
cp .env.example .env

# Start with Podman Compose
podman-compose up -d

# View logs
podman-compose logs -f
```

---

## Production Setup (Rootless)

### 1. Create User and Directories

```bash
# Create dedicated user (optional but recommended)
sudo useradd -r -m -d /opt/opencodehub opencodehub
sudo -u opencodehub mkdir -p /opt/opencodehub/{data,postgres,redis}

# Enable lingering (keeps user services running after logout)
sudo loginctl enable-linger opencodehub
```

### 2. Create Pod Configuration

Podman pods group containers like Kubernetes:

```bash
# Create a pod for all services
podman pod create \
  --name opencodehub \
  --publish 3000:3000 \
  --network bridge
```

### 3. Create Containers

```bash
# PostgreSQL
podman run -d \
  --pod opencodehub \
  --name och-postgres \
  -e POSTGRES_DB=opencodehub \
  -e POSTGRES_USER=opencodehub \
  -e POSTGRES_PASSWORD=securepassword \
  -v /opt/opencodehub/postgres:/var/lib/postgresql/data:Z \
  postgres:16-alpine

# Redis
podman run -d \
  --pod opencodehub \
  --name och-redis \
  redis:7-alpine \
  redis-server --requirepass redispassword

# Wait for DB to be ready
sleep 10

# OpenCodeHub App
podman run -d \
  --pod opencodehub \
  --name och-app \
  --env-file /opt/opencodehub/.env \
  -v /opt/opencodehub/data:/app/data:Z \
  ghcr.io/swadhinbiswas/opencodehub:latest
```

### 4. Production .env

```bash
cat > /opt/opencodehub/.env << 'EOF'
NODE_ENV=production
PORT=3000
SITE_URL=https://git.yourcompany.com

# Secrets
JWT_SECRET=your-64-char-hex-secret
SESSION_SECRET=your-64-char-hex-secret
INTERNAL_HOOK_SECRET=your-64-char-hex-secret

# Database (localhost because same pod)
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://opencodehub:securepassword@localhost:5432/opencodehub

# Redis
REDIS_URL=redis://:redispassword@localhost:6379

# Storage
STORAGE_TYPE=local
STORAGE_PATH=/app/data/repos
EOF
```

---

## Systemd Integration

The key advantage of Podman is native systemd support.

### Generate Systemd Units

```bash
# Generate unit files for the pod
podman generate systemd --new --files --name opencodehub

# Move to user systemd directory
mkdir -p ~/.config/systemd/user/
mv *.service ~/.config/systemd/user/

# Reload and enable
systemctl --user daemon-reload
systemctl --user enable pod-opencodehub.service
systemctl --user start pod-opencodehub.service
```

### Verify Service Status

```bash
systemctl --user status pod-opencodehub.service
systemctl --user status container-och-app.service
```

### Auto-start on Boot

```bash
# Enable lingering for the user
sudo loginctl enable-linger $(whoami)

# Now services start at boot, not login
```

---

## Using podman-compose

If you prefer the Compose workflow:

```yaml
# podman-compose.yml
version: '3.8'

services:
  app:
    image: ghcr.io/swadhinbiswas/opencodehub:latest
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./data:/app/data:Z
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: opencodehub
      POSTGRES_USER: opencodehub
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    volumes:
      - ./postgres:/var/lib/postgresql/data:Z

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
```

```bash
podman-compose up -d
```

:::note[SELinux Note]
The `:Z` suffix on volume mounts is required for SELinux systems (Fedora, RHEL) to set the correct context.
:::

---

## Networking

### Using CNI Plugins

```bash
# Create a dedicated network
podman network create opencodehub-net

# Use in pod
podman pod create \
  --name opencodehub \
  --network opencodehub-net \
  --publish 3000:3000
```

### Exposing via Nginx

```bash
# On host, configure Nginx to proxy to localhost:3000
sudo apt install nginx
```

See [Nginx Deployment Guide](/administration/deploy-nginx/) for configuration.

---

## Updating Containers

```bash
# Pull latest image
podman pull ghcr.io/swadhinbiswas/opencodehub:latest

# Recreate container
podman stop och-app
podman rm och-app
podman run -d \
  --pod opencodehub \
  --name och-app \
  --env-file /opt/opencodehub/.env \
  -v /opt/opencodehub/data:/app/data:Z \
  ghcr.io/swadhinbiswas/opencodehub:latest
```

### With Systemd

```bash
systemctl --user restart container-och-app.service
```

---

## Troubleshooting

### Permission Denied Errors

```bash
# Fix SELinux context
sudo chcon -R -t container_file_t /opt/opencodehub/data

# Or use :Z suffix on volumes
-v /path:/container/path:Z
```

### Container Can't Reach Database

```bash
# In a pod, use localhost, not container names
DATABASE_URL=postgresql://user:pass@localhost:5432/db
```

### Rootless Networking Issues

```bash
# Check slirp4netns is installed
sudo apt install slirp4netns

# Or use pasta (newer, faster)
sudo apt install passt
```

---

## Comparison with Docker

| Command | Docker | Podman |
|---------|--------|--------|
| Run container | `docker run` | `podman run` |
| Compose | `docker compose` | `podman-compose` |
| Build image | `docker build` | `podman build` |
| View logs | `docker logs` | `podman logs` |
| Systemd units | Manual | `podman generate systemd` |

Most Docker commands work identically with Podman.

---

## Next Steps

- [Configure Nginx reverse proxy](/administration/deploy-nginx/)
- [Set up monitoring](/administration/monitoring/)
- [Backup and restore](/administration/deploy-docker/#backup--restore)
