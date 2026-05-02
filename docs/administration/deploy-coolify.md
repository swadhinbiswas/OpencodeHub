# Deploy OpenCodeHub on Coolify

> **Difficulty:** Easy | **Time:** 20 minutes | **Method:** Docker Compose (Git-based)

Coolify is an open-source, self-hosted alternative to Heroku, Netlify, and Render. It makes deploying OpenCodeHub incredibly simple with built-in SSL, automatic deployments, and managed databases.

---

## Prerequisites

- A server (VPS) with Ubuntu 22.04/24.04, Debian 12, or CentOS 9
- Minimum **2 CPU cores, 4GB RAM, 40GB SSD**
- A domain name pointed to your server (e.g., `git.yourdomain.com`)
- Coolify v4 installed on your server

---

## Step 1: Install Coolify

If you haven't installed Coolify yet, run this on your server:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

After installation:
1. Open `http://your-server-ip:8000`
2. Complete the onboarding wizard
3. Set up your domain (e.g., `coolify.yourdomain.com`)

---

## Step 2: Create Resources in Coolify

### 2.1 Create a Project

1. In Coolify dashboard, click **Projects** → **Add**
2. Name it `OpenCodeHub`
3. Select your server and environment (e.g., `production`)

### 2.2 Create a PostgreSQL Database

1. Go to your project → **Resources** → **Add New Resource** → **Database**
2. Select **PostgreSQL**
3. Configuration:
   ```
   Name: opencodehub-postgres
   Version: 16
   Database: opencodehub
   Username: opencodehub
   Password: <generate-strong-password>
   ```
4. Click **Start**
5. **Note down the internal connection string** (e.g., `postgresql://opencodehub:password@opencodehub-postgres:5432/opencodehub`)

### 2.3 Create a Redis Instance

1. **Add New Resource** → **Database** → **Redis**
2. Configuration:
   ```
   Name: opencodehub-redis
   Version: 7-alpine
   Password: <generate-strong-password>
   ```
3. Click **Start**
4. **Note down the internal URL** (e.g., `redis://:password@opencodehub-redis:6379`)

---

## Step 3: Deploy OpenCodeHub Application

### 3.1 Add the Git Repository

1. Go to your project → **Resources** → **Add New Resource** → **Application**
2. Select **Public Repository**
3. Repository URL: `https://github.com/swadhinbiswas/OpencodeHub.git`
4. Branch: `main`
5. Build Pack: **Docker Compose**
6. Click **Continue**

### 3.2 Configure the Docker Compose

Coolify will auto-detect the `docker-compose.yml`. You need to customize it for Coolify's environment:

Replace the detected compose with this Coolify-optimized version:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: opencodehub
    restart: unless-stopped
    ports:
      - "4321:4321"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - SESSION_SECRET=${SESSION_SECRET}
      - INTERNAL_HOOK_SECRET=${INTERNAL_HOOK_SECRET}
      - CRON_SECRET=${CRON_SECRET}
      - RUNNER_SECRET=${RUNNER_SECRET}
      - WORKFLOW_SECRET_ENCRYPTION_KEY=${WORKFLOW_SECRET_ENCRYPTION_KEY}
      - SITE_URL=${COOLIFY_FQDN:-http://localhost:4321}
      - SSH_HOST_KEY_PATH=/data/ssh/host_key
      - STORAGE_TYPE=local
      - STORAGE_PATH=/data/storage
      - REPOS_PATH=/data/repos
    volumes:
      - opencodehub-repos:/data/repos
      - opencodehub-storage:/data/storage
      - opencodehub-ssh:/data/ssh
      - opencodehub-cache:/data/cache
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:4321/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

volumes:
  opencodehub-repos:
  opencodehub-storage:
  opencodehub-ssh:
  opencodehub-cache:
```

### 3.3 Set Environment Variables

In Coolify, go to your app → **Environment Variables** and add:

| Variable | Value | Description |
|----------|-------|-------------|
| `DATABASE_URL` | `postgresql://opencodehub:YOUR_PASS@opencodehub-postgres:5432/opencodehub` | From Step 2.2 |
| `REDIS_URL` | `redis://:YOUR_PASS@opencodehub-redis:6379` | From Step 2.3 |
| `JWT_SECRET` | `openssl rand -hex 32` | Generate this |
| `SESSION_SECRET` | `openssl rand -hex 32` | Generate this |
| `INTERNAL_HOOK_SECRET` | `openssl rand -hex 32` | Generate this |
| `CRON_SECRET` | `openssl rand -hex 32` | Generate this |
| `RUNNER_SECRET` | `openssl rand -hex 32` | Generate this |
| `WORKFLOW_SECRET_ENCRYPTION_KEY` | `openssl rand -hex 32` | Generate this |
| `SITE_URL` | `https://git.yourdomain.com` | Your domain |
| `COOLIFY_FQDN` | Leave as-is (auto-set) | Coolify injects this |

> **Security Tip:** Use Coolify's "Secret" toggle for all `*_SECRET` variables so they are encrypted at rest.

### 3.4 Configure Persistent Storage

In your app settings → **Persistent Storage**, verify these volumes are created:

| Volume Name | Container Path | Purpose |
|------------|----------------|---------|
| `opencodehub-repos` | `/data/repos` | Git repositories |
| `opencodehub-storage` | `/data/storage` | File uploads |
| `opencodehub-ssh` | `/data/ssh` | SSH host keys |
| `opencodehub-cache` | `/data/cache` | Application cache |

---

## Step 4: Configure Domain & SSL

### 4.1 Set Domain

1. In your app → **Settings** → **Domains**
2. Add your domain: `git.yourdomain.com`
3. Coolify will automatically configure the reverse proxy

### 4.2 Enable SSL

1. Go to **Settings** → **SSL/TLS**
2. Select **Let's Encrypt (Auto)**
3. Enable **HTTPS Redirect**
4. Click **Save**

Coolify handles:
- Nginx reverse proxy
- SSL certificate generation and renewal
- WebSocket support
- Gzip compression

---

## Step 5: Deploy

1. Click **Deploy**
2. Coolify will:
   - Clone the repository
   - Build the Docker image
   - Start the container
   - Run health checks
3. Wait for the "Healthy" status

---

## Step 6: Initial Setup

### 6.1 Create Admin User

Run the seed script inside the container:

```bash
# In Coolify dashboard, go to your app → "Execute Command" or use terminal
docker exec -it opencodehub bun run scripts/seed-admin.ts
```

Or via Coolify's web terminal:
1. Go to your app → **Terminal**
2. Run: `bun run scripts/seed-admin.ts`
3. Enter username, email, and password when prompted

### 6.2 Verify Installation

Visit `https://git.yourdomain.com` and log in with the admin credentials.

Test the API health endpoint:
```bash
curl https://git.yourdomain.com/api/health
```

---

## Step 7: Enable CI/CD Runner (Optional)

If you want to run CI/CD pipelines:

1. Go to your project → **Resources** → **Add New Resource**
2. Select **Docker Compose** → **Existing Docker Compose**
3. Add the runner service to your compose:

```yaml
  runner:
    build:
      context: .
      dockerfile: Dockerfile.runner
    container_name: opencodehub-runner
    restart: unless-stopped
    privileged: true
    environment:
      - RUNNER_TOKEN=${RUNNER_TOKEN}
      - SERVER_URL=https://git.yourdomain.com
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - runner-work:/work
      - runner-cache:/cache

volumes:
  runner-work:
  runner-cache:
```

4. Get the runner token from OpenCodeHub admin panel → Runners → Register Runner
5. Add `RUNNER_TOKEN` to environment variables
6. Deploy the updated compose

---

## Step 8: Automated Deployments (GitHub Integration)

### 8.1 Enable Auto-Deploy

1. In Coolify, go to your app → **Settings** → **Git**
2. Enable **Auto Deploy on Push**
3. Coolify will automatically rebuild and redeploy on every push to `main`

### 8.2 Preview Deployments (Optional)

For pull request previews:
1. Go to **Settings** → **Preview Deployments**
2. Enable **Pull Request Previews**
3. Each PR will get a unique URL like `pr-123.git.yourdomain.com`

---

## Maintenance

### Backup

Coolify has built-in backup for databases. To back up volumes:

```bash
# On your server
docker run --rm -v opencodehub-repos:/data -v $(pwd):/backup alpine tar czf /backup/repos-backup.tar.gz -C /data .
docker run --rm -v opencodehub-storage:/data -v $(pwd):/backup alpine tar czf /backup/storage-backup.tar.gz -C /data .
```

### Update OpenCodeHub

1. Push new code to your fork/main branch
2. Coolify auto-deploys, OR
3. In Coolify dashboard → your app → **Deploy**

### Monitor Logs

In Coolify dashboard:
- Go to your app → **Logs**
- Real-time logs with filtering
- Access historical logs

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Build fails with "ConnectionRefused"** | Retry the build; bun registry might be temporarily unavailable. The Dockerfile has built-in retry logic. |
| **App shows "502 Bad Gateway"** | Wait 2-3 minutes for first startup. Check logs for database connection errors. |
| **Database connection error** | Verify `DATABASE_URL` uses the internal Coolify service name (e.g., `opencodehub-postgres`). |
| **Storage not persisting** | Check that persistent volumes are mounted correctly in Coolify storage settings. |
| **SSL not working** | Ensure your domain DNS points to the Coolify server. Check Coolify's SSL logs. |
| **Git push over SSH fails** | Ensure port 2222 is exposed and not blocked by firewall. Map it in Coolify: `2222:2222`. |

---

## Architecture on Coolify

```
Internet
    |
    v
Cloudflare (optional)
    |
    v
Coolify Server
    |-- Coolify Proxy (Nginx + SSL)
    |-- OpenCodeHub App (Docker)
    |   |-- Port 4321: Web UI + API
    |   |-- Port 2222: SSH Git
    |-- PostgreSQL (managed)
    |-- Redis (managed)
    |-- OpenCodeHub Runner (optional, privileged Docker)
```

---

## Next Steps

- [Configure Email (SMTP)](../administration/configuration.md#email)
- [Set up Storage Adapter (S3/R2)](../guides/storage-adapters.md)
- [Enable Branch Protection](../guides/branch-protection.md)
- [Set up your First Stack](../tutorials/your-first-stack.md)
