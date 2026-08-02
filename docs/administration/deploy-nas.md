# Deploy OpenCodeHub on NAS (Synology, TrueNAS, QNAP)

> **Difficulty:** Intermediate | **Time:** 30-45 minutes | **Method:** Docker/Container Station

Deploy OpenCodeHub on your **Network Attached Storage (NAS)** device. This is perfect for small teams, personal use, or as a private Git server at home. Works on Synology DSM, TrueNAS SCALE, QNAP QTS, and any NAS supporting Docker.

> **Recommended:** the repository ships `docker-compose.nas.yml`, which is
> the production-safe version of every snippet below. It runs the web app,
> the **SSH Git server**, and the **background worker** as separate
> containers, requires secrets instead of defaulting them, and binds every
> data directory to one host path (`OCH_DATA_DIR`, default `/mnt/och`) —
> perfect for a dedicated hard disk or NAS share:
>
> ```bash
> cp .env.example .env      # then fill in ALL secrets
> OCH_DATA_DIR=/volume1/opencodehub docker compose -f docker-compose.nas.yml up -d
> ```
>
> The inline YAML in this guide is a minimal reference. Note that the **web
> app container does not run SSH Git** — if you use a snippet as-is, port
> 2222 will not serve SSH. Add the `ssh-git` service (or use
> `docker-compose.nas.yml`) for SSH access.

---

## Prerequisites

| NAS Type | Minimum Requirements |
|----------|---------------------|
| **Synology** | DSM 7.0+, 4GB RAM (8GB recommended), x86_64 or ARM64 (better performance on x86_64) |
| **TrueNAS SCALE** | 8GB RAM, 2 CPU cores, 40GB free space |
| **QNAP** | QTS 5.0+, 4GB RAM, Container Station installed |
| **Generic** | Docker/Podman support, 4GB RAM, 2 CPU cores |

- A domain with DDNS (Dynamic DNS) configured (e.g., `git.yourddns.net`) OR local network access only
- Port forwarding configured on your router (if accessing externally):
  - `80` → NAS:80
  - `443` → NAS:443
  - `2222` → NAS:2222 (for SSH Git, optional)

---

## Part 1: Synology DSM Deployment

### Step 1.1: Install Container Manager

1. Open **Package Center**
2. Search for **Container Manager** (DSM 7.2+) or **Docker** (older DSM)
3. Click **Install**

### Step 1.2: Create Shared Folders

1. Open **Control Panel** → **Shared Folder** → **Create**
2. Create these folders:
   - `opencodehub/repos` — Git repositories
   - `opencodehub/storage` — File uploads
   - `opencodehub/ssh` — SSH host keys
   - `opencodehub/cache` — Application cache
   - `opencodehub/postgres` — PostgreSQL data
   - `opencodehub/redis` — Redis data

3. Set permissions:
   - Right-click each folder → **Edit** → **Permissions**
   - Grant **Read/Write** to your admin user and the `Docker` system group

### Step 1.3: Set Up PostgreSQL

#### Using Container Manager GUI:

1. Open **Container Manager** → **Image** → **Add** → **Add from URL**
2. Image name: `postgres`
3. Tag: `16-alpine`
4. Click **Add**

5. Go to **Container** → **Create**
6. Select `postgres:16-alpine`
7. Configuration:
   - **Container name:** `opencodehub-postgres`
   - **Enable auto-restart:** Yes
   - **Network:** Use the same bridge network as other containers
   - **Environment variables:**
     ```
     POSTGRES_USER=opencodehub
     POSTGRES_PASSWORD=<generate-strong-password>
     POSTGRES_DB=opencodehub
     ```
   - **Volume settings:**
     ```
     /volume1/opencodehub/postgres  →  /var/lib/postgresql/data
     ```
   - **Port settings:**
     ```
     Local port: 5432  →  Container port: 5432
     ```
8. Click **Done**

#### Using SSH (Alternative):

```bash
ssh admin@your-synology-ip
sudo -i

docker run -d \
  --name opencodehub-postgres \
  --restart unless-stopped \
  -e POSTGRES_USER=opencodehub \
  -e POSTGRES_PASSWORD=YOUR_PASSWORD \
  -e POSTGRES_DB=opencodehub \
  -v /volume1/opencodehub/postgres:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16-alpine
```

### Step 1.4: Set Up Redis

Using Container Manager:
1. Pull `redis:7-alpine`
2. Create container:
   - **Name:** `opencodehub-redis`
   - **Environment:**
     ```
     REDIS_PASSWORD=<strong-password>
     ```
   - **Command:** `redis-server --appendonly yes --requirepass YOUR_PASSWORD`
   - **Volume:**
     ```
     /volume1/opencodehub/redis  →  /data
     ```
   - **Port:** `6379` → `6379`

Or via SSH:
```bash
docker run -d \
  --name opencodehub-redis \
  --restart unless-stopped \
  -v /volume1/opencodehub/redis:/data \
  -p 6379:6379 \
  redis:7-alpine \
  redis-server --appendonly yes --requirepass YOUR_PASSWORD
```

### Step 1.5: Deploy OpenCodeHub

#### Option A: Pre-built Image (Fastest)

If using the published Docker image:

```bash
docker run -d \
  --name opencodehub \
  --restart unless-stopped \
  --link opencodehub-postgres:postgres \
  --link opencodehub-redis:redis \
  -p 4321:4321 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://opencodehub:POSTGRES_PASS@host.docker.internal:5432/opencodehub \
  -e REDIS_URL=redis://:REDIS_PASS@host.docker.internal:6379 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e INTERNAL_HOOK_SECRET=$(openssl rand -hex 32) \
  -e CRON_SECRET=$(openssl rand -hex 32) \
  -e RUNNER_SECRET=$(openssl rand -hex 32) \
  -e WORKFLOW_SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32) \
  -e AI_CONFIG_ENCRYPTION_KEY=$(openssl rand -hex 32) \
  -e SITE_URL=https://git.yourddns.net \
  -e STORAGE_TYPE=local \
  -e STORAGE_PATH=/data/storage \
  -e GIT_REPOS_PATH=/data/repos \
  -e GIT_SSH_HOST_KEY=/data/ssh/host_key \
  -v /volume1/opencodehub/repos:/data/repos \
  -v /volume1/opencodehub/storage:/data/storage \
  -v /volume1/opencodehub/ssh:/data/ssh \
  -v /volume1/opencodehub/cache:/data/cache \
  opencodehub/opencodehub:latest
```

> **Note:** On Synology, `host.docker.internal` may not work. Use your NAS IP address instead (e.g., `192.168.1.100`).
>
> **SSH Git:** the app container serves the web UI only. For SSH access,
> run a second container from the same image with `PROCESS_TYPE=ssh` and
> expose port 2222 (this is exactly what `docker-compose.nas.yml` does).

#### Option B: Build from Source

1. In Container Manager → **Project** (Docker Compose):

```yaml
version: '3.8'

services:
  app:
    build:
      context: /volume1/docker/OpenCodeHub
      dockerfile: Dockerfile
    container_name: opencodehub
    restart: unless-stopped
    ports:
      - "4321:4321"
    environment:
      - NODE_ENV=production
      - PROCESS_TYPE=app
      - DATABASE_URL=postgresql://opencodehub:YOUR_PASS@postgres:5432/opencodehub
      - REDIS_URL=redis://:YOUR_PASS@redis:6379
      - JWT_SECRET=YOUR_SECRET
      - SESSION_SECRET=YOUR_SECRET
      - INTERNAL_HOOK_SECRET=YOUR_SECRET
      - CRON_SECRET=YOUR_SECRET
      - RUNNER_SECRET=YOUR_SECRET
      - WORKFLOW_SECRET_ENCRYPTION_KEY=YOUR_SECRET
      - AI_CONFIG_ENCRYPTION_KEY=YOUR_SECRET
      - SITE_URL=https://git.yourddns.net
      - STORAGE_TYPE=local
      - STORAGE_PATH=/data/storage
      - GIT_REPOS_PATH=/data/repos
      - REPOS_PATH=/data/repos
      - GIT_SSH_HOST_KEY=/data/ssh/host_key
      - GIT_SSH_PORT=2222
    volumes:
      - /volume1/opencodehub/repos:/data/repos
      - /volume1/opencodehub/storage:/data/storage
      - /volume1/opencodehub/ssh:/data/ssh
      - /volume1/opencodehub/cache:/data/cache
    depends_on:
      - postgres
      - redis
    networks:
      - och-net

  ssh-git:
    build:
      context: /volume1/docker/OpenCodeHub
      dockerfile: Dockerfile
    container_name: opencodehub-ssh
    restart: unless-stopped
    ports:
      - "2222:2222"
    environment:
      - NODE_ENV=production
      - PROCESS_TYPE=ssh
      - DATABASE_URL=postgresql://opencodehub:YOUR_PASS@postgres:5432/opencodehub
      - REDIS_URL=redis://:YOUR_PASS@redis:6379
      - JWT_SECRET=YOUR_SECRET
      - INTERNAL_HOOK_SECRET=YOUR_SECRET
      - GIT_REPOS_PATH=/data/repos
      - REPOS_PATH=/data/repos
      - GIT_SSH_HOST_KEY=/data/ssh/host_key
      - GIT_SSH_PORT=2222
    volumes:
      - /volume1/opencodehub/repos:/data/repos
      - /volume1/opencodehub/storage:/data/storage
      - /volume1/opencodehub/ssh:/data/ssh
      - /volume1/opencodehub/cache:/data/cache
    depends_on:
      - postgres
      - redis
    networks:
      - och-net

  worker:
    build:
      context: /volume1/docker/OpenCodeHub
      dockerfile: Dockerfile
    container_name: opencodehub-worker
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PROCESS_TYPE=worker
      - DATABASE_URL=postgresql://opencodehub:YOUR_PASS@postgres:5432/opencodehub
      - REDIS_URL=redis://:YOUR_PASS@redis:6379
      - JWT_SECRET=YOUR_SECRET
      - INTERNAL_HOOK_SECRET=YOUR_SECRET
      - GIT_REPOS_PATH=/data/repos
      - REPOS_PATH=/data/repos
      - STORAGE_TYPE=local
      - STORAGE_PATH=/data/storage
    volumes:
      - /volume1/opencodehub/repos:/data/repos
      - /volume1/opencodehub/storage:/data/storage
      - /volume1/opencodehub/ssh:/data/ssh
      - /volume1/opencodehub/cache:/data/cache
    depends_on:
      - postgres
      - redis
    networks:
      - och-net

  postgres:
    image: postgres:16-alpine
    container_name: opencodehub-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=opencodehub
      - POSTGRES_PASSWORD=YOUR_PASS
      - POSTGRES_DB=opencodehub
    volumes:
      - /volume1/opencodehub/postgres:/var/lib/postgresql/data
    networks:
      - och-net

  redis:
    image: redis:7-alpine
    container_name: opencodehub-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass YOUR_PASS
    volumes:
      - /volume1/opencodehub/redis:/data
    networks:
      - och-net

networks:
  och-net:
    driver: bridge
```

2. Save this as `docker-compose.yml` in `/volume1/docker/OpenCodeHub/`
3. Clone the repo to that folder first:
   ```bash
   cd /volume1/docker
   git clone https://github.com/swadhinbiswas/OpencodeHub.git
   ```
4. In Container Manager → **Project** → **Create**
5. Select the path `/volume1/docker/OpenCodeHub`
6. Click **Create**

### Step 1.6: Configure Reverse Proxy (Synology)

1. **Control Panel** → **Login Portal** → **Advanced** → **Reverse Proxy**
2. Click **Create**
3. **General:**
   - Source:
     - Protocol: HTTPS
     - Hostname: `git.yourddns.net`
     - Port: 443
   - Destination:
     - Protocol: HTTP
     - Hostname: `localhost`
     - Port: 4321
4. **Custom Header** → **Create** → **WebSocket**
   - Header name: `Upgrade`
   - Value: `$http_upgrade`
   - Header name: `Connection`
   - Value: `upgrade`
5. Click **Save**

### Step 1.7: SSL Certificate (Let's Encrypt)

1. **Control Panel** → **Security** → **Certificate**
2. Click **Add** → **Add a new certificate**
3. Select **Get a certificate from Let's Encrypt**
4. Domain name: `git.yourddns.net`
5. Email: your-email@example.com
6. Click **Apply**

7. After issuance, go to **Configure** and assign the certificate to:
   - `git.yourddns.net:443` (your reverse proxy)

---

## Part 2: TrueNAS SCALE Deployment

TrueNAS SCALE has native Kubernetes support with Helm charts, but Docker is easier via **Apps** (Docker Compose).

### Step 2.1: Create Datasets

1. Go to **Storage** → **Pools** → Your pool → **Add Dataset**
2. Create a parent dataset: `opencodehub`
3. Under it, create:
   - `repos`
   - `storage`
   - `ssh`
   - `cache`
   - `postgres`
   - `redis`

### Step 2.2: Deploy via Custom App (Docker Compose)

1. Go to **Apps** → **Discover Apps** → **Custom App**
2. Enable **Advanced Mode**
3. Enter this Docker Compose:

```yaml
version: '3.8'

services:
  app:
    image: opencodehub/opencodehub:latest
    container_name: opencodehub
    restart: unless-stopped
    ports:
      - "4321:4321"
    environment:
      - NODE_ENV=production
      - PROCESS_TYPE=app
      - DATABASE_URL=postgresql://opencodehub:YOUR_PASS@postgres:5432/opencodehub
      - REDIS_URL=redis://:YOUR_PASS@redis:6379
      - JWT_SECRET=YOUR_SECRET
      - SESSION_SECRET=YOUR_SECRET
      - INTERNAL_HOOK_SECRET=YOUR_SECRET
      - CRON_SECRET=YOUR_SECRET
      - RUNNER_SECRET=YOUR_SECRET
      - WORKFLOW_SECRET_ENCRYPTION_KEY=YOUR_SECRET
      - AI_CONFIG_ENCRYPTION_KEY=YOUR_SECRET
      - SITE_URL=https://git.yourdomain.com
      - STORAGE_TYPE=local
      - STORAGE_PATH=/data/storage
      - GIT_REPOS_PATH=/data/repos
      - REPOS_PATH=/data/repos
      - GIT_SSH_HOST_KEY=/data/ssh/host_key
      - GIT_SSH_PORT=2222
    volumes:
      - /mnt/YOURPOOL/opencodehub/repos:/data/repos
      - /mnt/YOURPOOL/opencodehub/storage:/data/storage
      - /mnt/YOURPOOL/opencodehub/ssh:/data/ssh
      - /mnt/YOURPOOL/opencodehub/cache:/data/cache
    depends_on:
      - postgres
      - redis
    networks:
      - och-net

  ssh-git:
    image: opencodehub/opencodehub:latest
    container_name: opencodehub-ssh
    restart: unless-stopped
    ports:
      - "2222:2222"
    environment:
      - NODE_ENV=production
      - PROCESS_TYPE=ssh
      - DATABASE_URL=postgresql://opencodehub:YOUR_PASS@postgres:5432/opencodehub
      - REDIS_URL=redis://:YOUR_PASS@redis:6379
      - JWT_SECRET=YOUR_SECRET
      - INTERNAL_HOOK_SECRET=YOUR_SECRET
      - GIT_REPOS_PATH=/data/repos
      - REPOS_PATH=/data/repos
      - GIT_SSH_HOST_KEY=/data/ssh/host_key
      - GIT_SSH_PORT=2222
    volumes:
      - /mnt/YOURPOOL/opencodehub/repos:/data/repos
      - /mnt/YOURPOOL/opencodehub/storage:/data/storage
      - /mnt/YOURPOOL/opencodehub/ssh:/data/ssh
      - /mnt/YOURPOOL/opencodehub/cache:/data/cache
    depends_on:
      - postgres
      - redis
    networks:
      - och-net

  worker:
    image: opencodehub/opencodehub:latest
    container_name: opencodehub-worker
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PROCESS_TYPE=worker
      - DATABASE_URL=postgresql://opencodehub:YOUR_PASS@postgres:5432/opencodehub
      - REDIS_URL=redis://:YOUR_PASS@redis:6379
      - JWT_SECRET=YOUR_SECRET
      - INTERNAL_HOOK_SECRET=YOUR_SECRET
      - GIT_REPOS_PATH=/data/repos
      - REPOS_PATH=/data/repos
      - STORAGE_TYPE=local
      - STORAGE_PATH=/data/storage
    volumes:
      - /mnt/YOURPOOL/opencodehub/repos:/data/repos
      - /mnt/YOURPOOL/opencodehub/storage:/data/storage
      - /mnt/YOURPOOL/opencodehub/ssh:/data/ssh
      - /mnt/YOURPOOL/opencodehub/cache:/data/cache
    depends_on:
      - postgres
      - redis
    networks:
      - och-net

  postgres:
    image: postgres:16-alpine
    container_name: opencodehub-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=opencodehub
      - POSTGRES_PASSWORD=YOUR_PASS
      - POSTGRES_DB=opencodehub
    volumes:
      - /mnt/YOURPOOL/opencodehub/postgres:/var/lib/postgresql/data
    networks:
      - och-net

  redis:
    image: redis:7-alpine
    container_name: opencodehub-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass YOUR_PASS
    volumes:
      - /mnt/YOURPOOL/opencodehub/redis:/data
    networks:
      - och-net

networks:
  och-net:
    driver: bridge
```

> Replace `YOURPOOL` with your actual pool name and `YOUR_PASS`/`YOUR_SECRET` with your values.

4. Click **Save**
5. TrueNAS will deploy all containers

### Step 2.3: Configure TrueNAS Certificate

1. **System** → **General** → **GUI SSL Certificate**
2. Or use **Apps** → **Certificates** for app-specific SSL
3. For external access, use TrueNAS's built-in ACME (Let's Encrypt) or upload your own certificate

### Step 2.4: Reverse Proxy with Nginx Proxy Manager (Recommended)

Install Nginx Proxy Manager from the TrueNAS Apps catalog:

1. **Apps** → **Discover Apps** → Search "Nginx Proxy Manager"
2. Install with default settings
3. Access Nginx Proxy Manager at `your-nas-ip:81`
4. Add Proxy Host:
   - Domain Names: `git.yourdomain.com`
   - Forward Hostname/IP: `opencodehub`
   - Forward Port: `4321`
   - Enable **Block Common Exploits**
   - SSL: Request a new SSL certificate from Let's Encrypt
   - Enable **Force SSL** and **HTTP/2 Support**

---

## Part 3: QNAP QTS Deployment

### Step 3.1: Install Container Station

1. Open **App Center**
2. Search for **Container Station**
3. Click **Install**

### Step 3.2: Create Folders

1. Open **File Station**
2. Create folder: `opencodehub`
3. Inside it create: `repos`, `storage`, `ssh`, `cache`, `postgres`, `redis`

### Step 3.3: Deploy via Container Station

#### Create Network:

1. Container Station → **Networks** → **Create**
2. Name: `opencodehub-network`
3. Driver: Bridge

#### Create PostgreSQL:

1. **Create** → **Search Docker Hub** → `postgres:16-alpine`
2. Click **Install**
3. Configuration:
   - Name: `opencodehub-postgres`
   - Network: `opencodehub-network`
   - Environment:
     ```
     POSTGRES_USER=opencodehub
     POSTGRES_PASSWORD=<password>
     POSTGRES_DB=opencodehub
     ```
   - Shared Folders:
     ```
     /share/Container/opencodehub/postgres  →  /var/lib/postgresql/data
     ```
   - Port: `5432`

#### Create Redis:

1. Search and install `redis:7-alpine`
2. Name: `opencodehub-redis`
3. Network: `opencodehub-network`
4. Command: `redis-server --appendonly yes --requirepass YOUR_PASS`
5. Shared Folders:
   ```
   /share/Container/opencodehub/redis  →  /data
   ```

#### Create OpenCodeHub:

1. Search and install `opencodehub/opencodehub:latest`
2. Name: `opencodehub`
3. Network: `opencodehub-network`
4. Environment variables (same as Synology example)
5. Shared Folders:
   ```
   /share/Container/opencodehub/repos    →  /data/repos
   /share/Container/opencodehub/storage  →  /data/storage
   /share/Container/opencodehub/ssh      →  /data/ssh
   /share/Container/opencodehub/cache    →  /data/cache
   ```
6. Ports: `4321`, `2222`

### Step 3.4: QNAP Reverse Proxy

1. **Control Panel** → **System** → **Reverse Proxy**
2. Click **Create**
3. Rule:
   - Name: `OpenCodeHub`
   - Source Protocol: HTTPS
   - Source URL: `git.yourdomain.com`
   - Port: 443
   - Destination Protocol: HTTP
   - Destination URL: `localhost`
   - Port: 4321
4. Enable **HSTS**

### Step 3.5: SSL Certificate

1. **Control Panel** → **Security** → **Certificate & Private Key**
2. Click **Replace Certificate**
3. Choose **Get from Let's Encrypt**
4. Enter your domain and email
5. Click **Apply**

---

## Part 4: Generic NAS / Any Docker Host

If your NAS supports Docker (via Portainer, Podman, or CLI):

### Using Docker Compose:

```bash
# Create directories
mkdir -p ~/opencodehub/{repos,storage,ssh,cache,postgres,redis}

# Create docker-compose.yml
cat > ~/opencodehub/docker-compose.yml << 'EOF'
version: '3.8'

services:
  app:
    image: opencodehub/opencodehub:latest
    container_name: opencodehub
    restart: unless-stopped
    ports:
      - "4321:4321"
    environment:
      - NODE_ENV=production
      - PROCESS_TYPE=app
      - DATABASE_URL=postgresql://opencodehub:YOUR_PASS@postgres:5432/opencodehub
      - REDIS_URL=redis://:YOUR_PASS@redis:6379
      - JWT_SECRET=YOUR_SECRET
      - SESSION_SECRET=YOUR_SECRET
      - INTERNAL_HOOK_SECRET=YOUR_SECRET
      - CRON_SECRET=YOUR_SECRET
      - RUNNER_SECRET=YOUR_SECRET
      - WORKFLOW_SECRET_ENCRYPTION_KEY=YOUR_SECRET
      - AI_CONFIG_ENCRYPTION_KEY=YOUR_SECRET
      - SITE_URL=https://git.yourdomain.com
      - STORAGE_TYPE=local
      - STORAGE_PATH=/data/storage
      - GIT_REPOS_PATH=/data/repos
      - REPOS_PATH=/data/repos
      - GIT_SSH_HOST_KEY=/data/ssh/host_key
      - GIT_SSH_PORT=2222
    volumes:
      - ./repos:/data/repos
      - ./storage:/data/storage
      - ./ssh:/data/ssh
      - ./cache:/data/cache
    depends_on:
      - postgres
      - redis
    networks:
      - och-net

  ssh-git:
    image: opencodehub/opencodehub:latest
    container_name: opencodehub-ssh
    restart: unless-stopped
    ports:
      - "2222:2222"
    environment:
      - NODE_ENV=production
      - PROCESS_TYPE=ssh
      - DATABASE_URL=postgresql://opencodehub:YOUR_PASS@postgres:5432/opencodehub
      - REDIS_URL=redis://:YOUR_PASS@redis:6379
      - JWT_SECRET=YOUR_SECRET
      - INTERNAL_HOOK_SECRET=YOUR_SECRET
      - GIT_REPOS_PATH=/data/repos
      - REPOS_PATH=/data/repos
      - GIT_SSH_HOST_KEY=/data/ssh/host_key
      - GIT_SSH_PORT=2222
    volumes:
      - ./repos:/data/repos
      - ./storage:/data/storage
      - ./ssh:/data/ssh
      - ./cache:/data/cache
    depends_on:
      - postgres
      - redis
    networks:
      - och-net

  worker:
    image: opencodehub/opencodehub:latest
    container_name: opencodehub-worker
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PROCESS_TYPE=worker
      - DATABASE_URL=postgresql://opencodehub:YOUR_PASS@postgres:5432/opencodehub
      - REDIS_URL=redis://:YOUR_PASS@redis:6379
      - JWT_SECRET=YOUR_SECRET
      - INTERNAL_HOOK_SECRET=YOUR_SECRET
      - GIT_REPOS_PATH=/data/repos
      - REPOS_PATH=/data/repos
      - STORAGE_TYPE=local
      - STORAGE_PATH=/data/storage
    volumes:
      - ./repos:/data/repos
      - ./storage:/data/storage
      - ./ssh:/data/ssh
      - ./cache:/data/cache
    depends_on:
      - postgres
      - redis
    networks:
      - och-net

  postgres:
    image: postgres:16-alpine
    container_name: opencodehub-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=opencodehub
      - POSTGRES_PASSWORD=YOUR_PASS
      - POSTGRES_DB=opencodehub
    volumes:
      - ./postgres:/var/lib/postgresql/data
    networks:
      - och-net

  redis:
    image: redis:7-alpine
    container_name: opencodehub-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass YOUR_PASS
    volumes:
      - ./redis:/data
    networks:
      - och-net

networks:
  och-net:
    driver: bridge
EOF

# Deploy
cd ~/opencodehub
docker-compose up -d
```

---

## Step 5: Router Port Forwarding

For external access, forward these ports on your router:

| External Port | Internal IP | Internal Port | Purpose |
|--------------|-------------|---------------|---------|
| 80 | Your NAS IP | 80 | HTTP (for Let's Encrypt/redirect) |
| 443 | Your NAS IP | 443 | HTTPS (OpenCodeHub web) |
| 2222 | Your NAS IP | 2222 | SSH Git (optional) |

> **Security Note:** If using a reverse proxy, you only need to forward 80 and 443. Port 4321 should NOT be exposed externally.

---

## Step 6: Dynamic DNS (DDNS)

If you don't have a static IP:

### Synology:
1. **Control Panel** → **External Access** → **DDNS**
2. Click **Add**
3. Service Provider: Synology, No-IP, DuckDNS, etc.
4. Enter hostname: `git.yourddns.net`
5. Click **Test Connection** → **OK**

### TrueNAS:
1. **Network** → **Global Configuration** → **Nameservers**
2. Use Cloudflare or your DNS provider's API for dynamic updates
3. Or install a DDNS client as a custom app

### QNAP:
1. **Control Panel** → **Network & File Services** → **DDNS**
2. Click **Add**
3. Select provider and configure

### Router DDNS:
Most routers (UniFi, ASUS, TP-Link) have built-in DDNS. Configure it to update `git.yourddns.net` automatically.

---

## Step 7: Create Admin User

```bash
# Synology/QNAP/Generic
ssh admin@your-nas-ip
docker exec -it opencodehub bun run scripts/seed-admin.ts

# TrueNAS
kubectl exec -it deployment/opencodehub -- bun run scripts/seed-admin.ts
```

Enter username, email, and password.

---

## Step 8: Initial Setup & Verification

1. Visit `https://git.yourddns.net` (or your domain)
2. Log in with admin credentials
3. Create your first organization
4. Test Git over HTTPS:
   ```bash
   git clone https://git.yourddns.net/admin/test-repo.git
   ```

---

## Maintenance

### Update OpenCodeHub

```bash
cd ~/opencodehub  # or /volume1/docker/OpenCodeHub, etc.
docker-compose pull
docker-compose up -d
```

### Backup Strategy

#### Automated Backup (Synology):

1. **Hyper Backup** → **Create** → **Local/Remote**
2. Select `opencodehub` shared folder
3. Schedule: Daily at 2 AM
4. Retention: Keep last 7 versions

#### Manual Backup:

```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/path/to/backups"

# Database
docker exec opencodehub-postgres pg_dump -U opencodehub opencodehub | gzip > $BACKUP_DIR/och-db-$DATE.sql.gz

# Files
tar czf $BACKUP_DIR/och-files-$DATE.tar.gz /path/to/opencodehub/repos /path/to/opencodehub/storage

# Keep only last 7 days
find $BACKUP_DIR -name "och-*" -mtime +7 -delete
```

### Monitor Resources

| NAS | Monitoring Tool |
|-----|----------------|
| Synology | **Resource Monitor** widget |
| TrueNAS | **Reporting** → CPU/Memory/Disk |
| QNAP | **Resource Monitor** in Dashboard |

OpenCodeHub on NAS typically uses:
- **RAM:** 1-2GB idle, 2-4GB under load
- **CPU:** 10-30% during normal use
- **Disk:** Grows with repos and uploads

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Container won't start** | Check logs: `docker logs opencodehub`. Often a database connection issue. |
| **"host.docker.internal" not found** | Use your NAS's LAN IP (e.g., `192.168.1.100`) instead of `host.docker.internal`. |
| **Permission denied on volumes** | Ensure the Docker user has read/write access to the shared folders. On Synology, set permissions for the `Docker` group. |
| **Slow performance** | NAS devices often have slow CPUs. Ensure you have at least 4GB RAM. Consider using SSD for the `postgres` volume. |
| **SSL certificate errors** | Ensure your domain resolves correctly. Check DDNS is updating your IP. |
| **Git SSH not connecting** | Port 2222 must be forwarded on router. Some ISPs block port 22/2222. Try a different high port (e.g., 8022). |
| **Database corruption after power loss** | PostgreSQL with default settings can corrupt on unclean shutdown. Use a UPS. For extra safety, add `fsync=on` to PostgreSQL config. |
| **Out of memory** | Synology/QNAP with 2GB RAM will struggle. Close unused packages. Add a swap file if needed. |

---

## NAS-Specific Tips

### Synology
- Enable **Snapshot Replication** for instant recovery
- Use **SSO Client** if you want to integrate with existing domain auth
- Consider **Virtual Machine Manager** if you need more isolation

### TrueNAS SCALE
- Use **Apps** instead of VMs for better resource efficiency
- Enable **Automatic container updates** in TrueNAS settings
- Consider **TrueCharts** catalog for additional apps

### QNAP
- Use **QuTS hero** (ZFS) for better data integrity
- Enable ** snapshots** for the opencodehub dataset
- **QVPN** can secure remote access without exposing ports

---

## Next Steps

- [Configure Email (SMTP)](../administration/configuration.md#email)
- [Set up Offsite Storage (S3/R2)](../guides/storage-adapters.md) — highly recommended for NAS (protects against drive failure)
- [Enable Branch Protection](../guides/branch-protection.md)
- [Set up your First Stack](../tutorials/your-first-stack.md)
