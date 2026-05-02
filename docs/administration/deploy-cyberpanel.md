# Deploy OpenCodeHub on CyberPanel

> **Difficulty:** Easy-Intermediate | **Time:** 25-35 minutes | **Method:** Docker Compose (recommended) or LiteSpeed Node.js

**CyberPanel** is a modern, free, open-source hosting control panel powered by OpenLiteSpeed. It offers better performance than cPanel for modern applications and has native Docker support in the Enterprise version.

---

## Prerequisites

- VPS with Ubuntu 22.04/24.04, AlmaLinux 8/9, or Rocky Linux 8/9
- Minimum **2 CPU cores, 4GB RAM, 40GB SSD**
- Root or sudo access
- A domain/subdomain pointed to your server (e.g., `git.yourdomain.com`)

---

## Step 1: Install CyberPanel

If you haven't installed CyberPanel yet:

```bash
# Run the installer
sh <(curl https://cyberpanel.net/install.sh || wget -O - https://cyberpanel.net/install.sh)
```

During installation:
1. Select **1** for CyberPanel + OpenLiteSpeed
2. Select **1** for Full installation
3. Set MySQL password
4. Choose whether to install PowerDNS, Postfix, Pure-FTPd (optional)
5. Install Memcached/Redis (select **Y** for Redis - we'll use it)
6. Install Watchdog (recommended)

After installation, access CyberPanel at:
```
https://your-server-ip:8090
```

---

## Deployment Method A: Docker Compose (Recommended)

CyberPanel Enterprise and recent versions support Docker. This is the easiest and most complete method.

### Step A.1: Enable Docker in CyberPanel

1. Log into CyberPanel
2. Go to **Docker** → **Install Docker**
3. Wait for installation to complete
4. Go to **Docker** → **Images** → **Pull Image**
5. Pull these images:
   - `postgres:16-alpine`
   - `redis:7-alpine`

### Step A.2: Create Docker Network

```bash
# SSH into your server
ssh root@your-server-ip

docker network create opencodehub-network
```

### Step A.3: Create Persistent Volumes

```bash
mkdir -p /var/lib/opencodehub/{repos,storage,ssh,cache}
```

### Step A.4: Start PostgreSQL Container

In CyberPanel:
1. Go to **Docker** → **Containers** → **Create Container**
2. Or use CLI:

```bash
docker run -d \
  --name opencodehub-postgres \
  --network opencodehub-network \
  -e POSTGRES_USER=opencodehub \
  -e POSTGRES_PASSWORD=$(openssl rand -hex 16) \
  -e POSTGRES_DB=opencodehub \
  -v opencodehub-postgres:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  --restart unless-stopped \
  postgres:16-alpine
```

Note the password you set.

### Step A.5: Start Redis Container

```bash
docker run -d \
  --name opencodehub-redis \
  --network opencodehub-network \
  -v opencodehub-redis:/data \
  -p 127.0.0.1:6379:6379 \
  --restart unless-stopped \
  redis:7-alpine \
  redis-server --appendonly yes --requirepass $(openssl rand -hex 16)
```

Note the Redis password.

### Step A.6: Deploy OpenCodeHub

#### Clone and Build

```bash
cd /var/lib/opencodehub
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub

# Create environment file
cp .env.example .env
nano .env
```

Configure `.env`:
```bash
# Database
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://opencodehub:POSTGRES_PASSWORD@127.0.0.1:5432/opencodehub

# Redis
REDIS_URL=redis://:REDIS_PASSWORD@127.0.0.1:6379

# Secrets (generate each with: openssl rand -hex 32)
JWT_SECRET=
SESSION_SECRET=
INTERNAL_HOOK_SECRET=
CRON_SECRET=
RUNNER_SECRET=
WORKFLOW_SECRET_ENCRYPTION_KEY=

# Site
SITE_URL=https://git.yourdomain.com
NODE_ENV=production

# Storage
STORAGE_DRIVER=local
STORAGE_PATH=/data/storage
REPOS_PATH=/data/repos
SSH_HOST_KEY_PATH=/data/ssh/host_key

# Skip Redis check during build
SKIP_REDIS_CHECK=1
```

#### Build and Run

```bash
# Build the Docker image
docker build -t opencodehub:prod .

# Run the container
docker run -d \
  --name opencodehub \
  --network opencodehub-network \
  -p 127.0.0.1:4321:4321 \
  -p 2222:2222 \
  -v /var/lib/opencodehub/repos:/data/repos \
  -v /var/lib/opencodehub/storage:/data/storage \
  -v /var/lib/opencodehub/ssh:/data/ssh \
  -v /var/lib/opencodehub/cache:/data/cache \
  --env-file .env \
  --restart unless-stopped \
  opencodehub:prod
```

### Step A.7: Configure Reverse Proxy in CyberPanel

1. In CyberPanel, go to **Websites** → **Create Website**
2. Domain: `git.yourdomain.com`
3. Package: Default
4. Owner: admin
5. PHP: Any (we'll use proxy, not PHP)
6. SSL: Select **Issue SSL**
7. Click **Create Website**

Now configure the reverse proxy:

```bash
# SSH into server
nano /usr/local/lsws/conf/vhosts/git.yourdomain.com/vhost.conf
```

Add or modify the virtual host configuration:

```apache
<virtualHost>
  <name>git.yourdomain.com</name>
  <address>*</address>
  <port>80</port>
  <docRoot>/var/www/html</docRoot>

  <rewrite>
    <enable>1</enable>
    <rules>
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule (.*) https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
    </rules>
  </rewrite>
</virtualHost>

<virtualHost>
  <name>git.yourdomain.com</name>
  <address>*</address>
  <port>443</port>
  <docRoot>/var/www/html</docRoot>

  <ssl>
    <enable>1</enable>
    <certFile>/etc/letsencrypt/live/git.yourdomain.com/fullchain.pem</certFile>
    <keyFile>/etc/letsencrypt/live/git.yourdomain.com/privkey.pem</keyFile>
  </ssl>

  <extProcessor>
    <name>opencodehub</name>
    <type>proxy</type>
    <address>127.0.0.1:4321</address>
    <maxConns>100</maxConns>
    <initTimeout>30</initTimeout>
    <retryTimeout>10</retryTimeout>
    <pcKeepAliveTimeout>5</pcKeepAliveTimeout>
  </extProcessor>

  <context>
    <type>proxy</type>
    <uri>/</uri>
    <handler>opencodehub</handler>
    <addDefaultCharset>off</addDefaultCharset>
  </context>

  <context>
    <type>proxy</type>
    <uri>/*.git/</uri>
    <handler>opencodehub</handler>
    <addDefaultCharset>off</addDefaultCharset>
  </context>
</virtualHost>
```

Restart OpenLiteSpeed:
```bash
systemctl restart lsws
```

---

## Deployment Method B: LiteSpeed Node.js (No Docker)

If you prefer not to use Docker, CyberPanel supports Node.js apps natively via LiteSpeed.

### Step B.1: Install Node.js

```bash
# SSH as root
source /etc/profile
yum install -y nodejs npm  # AlmaLinux/Rocky
# OR
apt install -y nodejs npm  # Ubuntu

# Install Bun
curl -fsSL https://bun.sh/install | bash
```

### Step B.2: Create Website in CyberPanel

1. **Websites** → **Create Website**
2. Domain: `git.yourdomain.com`
3. SSL: Issue Let's Encrypt
4. Click **Create**

### Step B.3: Set Up PostgreSQL

CyberPanel uses MariaDB by default. Install PostgreSQL:

```bash
# AlmaLinux/Rocky 9
sudo dnf install -y postgresql16-server postgresql16-contrib
sudo /usr/pgsql-16/bin/postgresql-16-setup initdb
sudo systemctl enable --now postgresql-16

# Create database
sudo -u postgres psql -c "CREATE USER opencodehub WITH PASSWORD 'strongpassword';"
sudo -u postgres psql -c "CREATE DATABASE opencodehub OWNER opencodehub;"
```

### Step B.4: Deploy OpenCodeHub Code

```bash
cd /home/git.yourdomain.com/public_html
git clone https://github.com/swadhinbiswas/OpencodeHub.git .
```

### Step B.5: Configure Node.js App in CyberPanel

1. Go to **Websites** → **List Websites**
2. Click **Manage** for `git.yourdomain.com`
3. Go to **Node.js** → **Setup Node.js App**
4. Configuration:
   ```
   Application Name: opencodehub
   Application Startup File: dist/server/entry.mjs
   Application Path: /home/git.yourdomain.com/public_html
   Application URL: git.yourdomain.com
   ```
5. In **Environment Variables**, add all values from `.env`
6. Click **Create**

### Step B.6: Build and Start

```bash
cd /home/git.yourdomain.com/public_html
cp .env.example .env
# Edit .env with your values
nano .env

# Install dependencies
bun install

# Build
export SKIP_REDIS_CHECK=1
bun run build

# Initialize database
bun run db:push

# Create admin user
bun run scripts/seed-admin.ts
```

Back in CyberPanel:
1. Go to **Node.js** → **Manage Node.js Apps**
2. Click **Start** for your app

---

## Step 2: Create Admin User (Docker Method)

```bash
# If using Docker
docker exec -it opencodehub bun run scripts/seed-admin.ts
```

Enter username, email, and password.

---

## Step 3: Verify Installation

```bash
# Check container is running
docker ps

# Check logs
docker logs opencodehub

# Test health
curl http://127.0.0.1:4321/api/health
```

Visit `https://git.yourdomain.com` in your browser.

---

## Step 4: Configure Firewall

CyberPanel uses firewalld/ufw. Open necessary ports:

```bash
# For SSH Git access
firewall-cmd --permanent --add-port=2222/tcp
firewall-cmd --reload

# For OpenCodeHub web (if not using reverse proxy)
# Port 4321 should only be accessible locally (127.0.0.1) when behind proxy
```

---

## Step 5: Set Up CI/CD Runner (Docker Method)

If you deployed via Docker:

```bash
# Build runner image
docker build -t opencodehub-runner -f Dockerfile.runner .

# Run runner
docker run -d \
  --name opencodehub-runner \
  --network opencodehub-network \
  --privileged \
  -e SERVER_URL=https://git.yourdomain.com \
  -e RUNNER_TOKEN=<get-from-admin-panel> \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /var/lib/opencodehub/runner-work:/work \
  -v /var/lib/opencodehub/runner-cache:/cache \
  --restart unless-stopped \
  opencodehub-runner
```

Get the runner token from OpenCodeHub admin panel → **Runners** → **Register Runner**.

---

## Step 6: SSL with Let's Encrypt

### In CyberPanel Dashboard:

1. Go to **SSL** → **Manage SSL**
2. Select `git.yourdomain.com`
3. Click **Issue SSL**
4. CyberPanel will automatically configure OpenLiteSpeed with the certificate

### Auto-Renewal:

CyberPanel handles Let's Encrypt auto-renewal automatically.

---

## Maintenance

### Update OpenCodeHub

```bash
cd /var/lib/opencodehub/OpenCodeHub
git pull origin main

# Rebuild
docker build -t opencodehub:prod .

# Restart container
docker stop opencodehub
docker rm opencodehub

# Re-run with same docker run command from Step A.6
```

Or use Docker Compose for easier management:

```bash
# Create docker-compose.yml in /var/lib/opencodehub
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  app:
    build:
      context: ./OpenCodeHub
      dockerfile: Dockerfile
    container_name: opencodehub
    restart: unless-stopped
    ports:
      - "127.0.0.1:4321:4321"
      - "2222:2222"
    env_file: ./OpenCodeHub/.env
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
    restart: unless-stopped
    environment:
      POSTGRES_USER: opencodehub
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: opencodehub
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    networks:
      - och-net

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - ./redis-data:/data
    networks:
      - och-net

  runner:
    build:
      context: ./OpenCodeHub
      dockerfile: Dockerfile.runner
    container_name: opencodehub-runner
    restart: unless-stopped
    privileged: true
    environment:
      - SERVER_URL=https://git.yourdomain.com
      - RUNNER_TOKEN=${RUNNER_TOKEN}
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./runner-work:/work
      - ./runner-cache:/cache
    networks:
      - och-net

networks:
  och-net:
    driver: bridge
EOF

# Create .env for compose
cat > .env << 'EOF'
POSTGRES_PASSWORD=your-postgres-password
REDIS_PASSWORD=your-redis-password
RUNNER_TOKEN=your-runner-token
EOF

# Deploy
docker-compose up -d --build

# Update
cd /var/lib/opencodehub
docker-compose pull
docker-compose up -d --build
```

### Backup

```bash
# Database
docker exec opencodehub-postgres pg_dump -U opencodehub opencodehub > backup-$(date +%Y%m%d).sql

# Files
tar czf och-backup-$(date +%Y%m%d).tar.gz /var/lib/opencodehub/repos /var/lib/opencodehub/storage
```

Set up a cron job in CyberPanel → **Cron Jobs**:
```
0 2 * * * cd /var/lib/opencodehub && docker exec opencodehub-postgres pg_dump -U opencodehub opencodehub > backups/backup-$(date +\%Y\%m\%d).sql
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **502 Bad Gateway** | Check if OpenCodeHub container is running: `docker ps`. Check logs: `docker logs opencodehub`. |
| **SSL not working** | Re-issue SSL in CyberPanel → SSL → Manage SSL. Ensure DNS points to server. |
| **Database connection error** | Verify PostgreSQL container is running. Check `.env` DATABASE_URL uses correct password. |
| **Git SSH not working** | Ensure port 2222 is open in firewall. Verify SSH host key is generated in `/data/ssh`. |
| **Build fails** | Check Docker has enough disk space: `docker system df`. Free space with `docker system prune`. |
| **Node.js app won't start (Method B)** | Check LiteSpeed error logs in CyberPanel → Logs. Verify `dist/server/entry.mjs` exists after build. |
| **Permission denied on files** | Fix ownership: `chown -R 1000:1000 /var/lib/opencodehub/*` (Docker runs as user 1000/bun). |

---

## Performance Tuning

CyberPanel + OpenLiteSpeed is already optimized, but you can tune further:

### Enable LSCache

1. Go to **Websites** → **List Websites** → **Manage**
2. **LiteSpeed Cache** → **Enable**
3. This caches static assets and improves load times

### PHP Tuning (Not applicable, but good for other sites)

Keep CyberPanel's default PHP settings for any WordPress/other sites running alongside.

### Database Optimization

```bash
# In PostgreSQL container
docker exec -it opencodehub-postgres psql -U opencodehub -d opencodehub

# Run VACUUM
VACUUM ANALYZE;
```

Set up a weekly cron:
```
0 3 * * 0 docker exec opencodehub-postgres psql -U opencodehub -d opencodehub -c "VACUUM ANALYZE;"
```

---

## Next Steps

- [Configure Email (SMTP)](../administration/configuration.md#email)
- [Set up Storage Adapter (S3/R2)](../guides/storage-adapters.md)
- [Enable Branch Protection](../guides/branch-protection.md)
- [Set up your First Stack](../tutorials/your-first-stack.md)
