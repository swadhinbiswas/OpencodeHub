---
title: "Deploy with Docker"
description: "Complete guide to deploying OpenCodeHub using Docker and Docker Compose"
---

Docker is the recommended deployment method for OpenCodeHub. This guide covers everything from basic setup to production-ready configurations.

## Prerequisites

- Docker Engine 24.0+
- Docker Compose v2.20+
- 2GB RAM minimum (4GB recommended)
- 20GB disk space

```bash
# Verify installation
docker --version
docker compose version
```

---

## Quick Start (Development)

For testing or development, use the minimal configuration:

```bash
# Clone the repository
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub

# Copy environment file
cp .env.example .env

# Start with Docker Compose
docker compose up -d

# View logs
docker compose logs -f
```

Access at `http://localhost:3000`

---

## Production Setup

### 1. Create Directory Structure

```bash
mkdir -p /opt/opencodehub/{data,postgres,redis}
cd /opt/opencodehub
```

### 2. Create docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    image: ghcr.io/swadhinbiswas/opencodehub:latest
    # Or build from source:
    # build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    volumes:
      - ./data:/app/data
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: opencodehub
      POSTGRES_USER: opencodehub
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    volumes:
      - ./postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U opencodehub"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### 3. Create Production .env

```bash
# Generate secure secrets
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
INTERNAL_HOOK_SECRET=$(openssl rand -hex 32)
DATABASE_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)

cat > .env << EOF
# Application
NODE_ENV=production
PORT=3000
SITE_URL=https://git.yourcompany.com

# Security (NEVER commit these!)
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
INTERNAL_HOOK_SECRET=${INTERNAL_HOOK_SECRET}

# Database
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://opencodehub:${DATABASE_PASSWORD}@postgres:5432/opencodehub
DATABASE_PASSWORD=${DATABASE_PASSWORD}

# Redis
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# Storage (use local for best performance)
STORAGE_TYPE=local
STORAGE_PATH=/app/data/repos
EOF
```

### 4. Start Services

```bash
docker compose up -d

# Verify all services are healthy
docker compose ps

# Initialize database
docker compose exec app bun run db:push

# Create admin user
docker compose exec app bun run scripts/seed-admin.ts
```

---

## Using with Nginx (Recommended)

See the [Nginx Deployment Guide](/administration/deploy-nginx/) for reverse proxy configuration.

### Quick Nginx Setup

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

    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Docker Swarm Deployment

For high availability:

```yaml
version: '3.8'

services:
  app:
    image: ghcr.io/swadhinbiswas/opencodehub:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
    # ... rest of config
```

```bash
docker stack deploy -c docker-compose.yml opencodehub
```

---

## Backup & Restore

### Backup

```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR=/backups/opencodehub

mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker compose exec -T postgres pg_dump -U opencodehub opencodehub | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup repositories
tar -czf $BACKUP_DIR/repos_$DATE.tar.gz -C /opt/opencodehub/data .

# Keep last 7 days
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
```

### Restore

```bash
# Restore database
gunzip -c db_backup.sql.gz | docker compose exec -T postgres psql -U opencodehub opencodehub

# Restore repositories
tar -xzf repos_backup.tar.gz -C /opt/opencodehub/data
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs app

# Common issues:
# 1. Database not ready - increase healthcheck start_period
# 2. Port in use - change ports mapping
# 3. Missing env vars - check .env file
```

### Database connection issues

```bash
# Verify PostgreSQL is accessible
docker compose exec app nc -zv postgres 5432

# Check database exists
docker compose exec postgres psql -U opencodehub -l
```

### Out of disk space

```bash
# Clean Docker resources
docker system prune -a --volumes

# Check disk usage
docker system df
```

---

## Next Steps

- [Configure Nginx reverse proxy](/administration/deploy-nginx/)
- [Set up SSL with Let's Encrypt](/administration/deploy-nginx/#ssl-setup)
- [Configure monitoring](/administration/monitoring/)
