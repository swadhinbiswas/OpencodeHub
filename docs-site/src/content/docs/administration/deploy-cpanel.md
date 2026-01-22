---
title: "Deploy with cPanel"
description: "Deploy OpenCodeHub on shared hosting using cPanel's Node.js Application feature"
---

cPanel supports Node.js applications through its Application Manager. This guide covers deploying OpenCodeHub on cPanel-based shared hosting.

:::caution[Limitations]
Shared hosting has significant limitations for Git servers:

- No Docker support
- Limited process control
- Shared resources with other users
- May not support persistent processes

For production use, consider a VPS or dedicated server instead.
:::

## Prerequisites

- cPanel hosting with Node.js support (v18+)
- PostgreSQL database addon (or external database)
- SSH access recommended
- Domain configured in cPanel

---

## Step 1: Create PostgreSQL Database

1. Login to cPanel
2. Go to **Databases → PostgreSQL Databases**
3. Create a new database: `opencodehub`
4. Create a new user with a strong password
5. Add user to database with ALL PRIVILEGES
6. Note the connection string:
   ```
   postgresql://username:password@localhost:5432/opencodehub
   ```

---

## Step 2: Upload Application Files

### Option A: Git Clone (if SSH available)

```bash
ssh username@yourhost.com
cd ~/
git clone https://github.com/swadhinbiswas/OpencodeHub.git opencodehub
```

### Option B: File Manager Upload

1. Download the repository as ZIP from GitHub
2. Go to cPanel → **File Manager**
3. Navigate to your home directory
4. Upload and extract the ZIP file
5. Rename to `opencodehub`

---

## Step 3: Create Node.js Application

1. Go to cPanel → **Setup Node.js App**
2. Click **Create Application**
3. Configure:

| Setting                  | Value                   |
| ------------------------ | ----------------------- |
| Node.js version          | 18.x or 20.x            |
| Application mode         | Production              |
| Application root         | `opencodehub`           |
| Application URL          | `git.yourdomain.com`    |
| Application startup file | `dist/server/entry.mjs` |

4. Click **Create**

---

## Step 4: Configure Environment Variables

In the Node.js Application page:

1. Scroll to **Environment Variables**
2. Add the following:

```bash
NODE_ENV=production
PORT=3000
SITE_URL=https://git.yourdomain.com

# Database
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://cpuser_dbuser:password@localhost:5432/cpuser_opencodehub

# Security (generate with: openssl rand -hex 32)
JWT_SECRET=<64-char-hex>
SESSION_SECRET=<64-char-hex>
INTERNAL_HOOK_SECRET=<64-char-hex>

# Storage
STORAGE_TYPE=local
STORAGE_PATH=./data/repos
```

3. Click **Save**

---

## Step 5: Install Dependencies and Build

1. In the Node.js app page, click **Run NPM Install**
2. Connect via SSH and run:

```bash
cd ~/opencodehub

# Enter virtual environment
source /home/username/nodevenv/opencodehub/18/bin/activate

# Install dependencies
npm install

# Build the application
npm run build

# Initialize database
npm run db:push

# Create admin user (if script exists)
npm run scripts/seed-admin.ts
```

---

## Step 6: Start Application

1. In cPanel Node.js app manager, click **Start App**
2. Verify it's running by visiting your domain

---

## Alternative: Using PM2

If your host supports PM2:

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/server/entry.mjs --name opencodehub

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

---

## Handling Git Operations

:::warning[Important]
cPanel's Node.js apps may not handle long-running Git operations well. For push/pull with large repos, you may experience timeouts.
:::

### Workarounds

1. **Increase PHP/Node timeout** (if available in hosting settings)
2. **Use external storage** (S3) to reduce local I/O
3. **Consider VPS** for better control

---

## Troubleshooting

### Application Won't Start

1. Check error logs in cPanel → **Errors**
2. Verify Node.js version compatibility
3. Check if all dependencies installed
4. Verify startup file path is correct

### Database Connection Errors

```bash
# Test connection via SSH
psql "postgresql://user:pass@localhost/dbname"
```

### 503 Service Unavailable

- Application may have crashed
- Check logs and restart via cPanel

---

## Limitations Summary

| Feature         | cPanel Support                |
| --------------- | ----------------------------- |
| Web UI          | ✅ Works                      |
| Git clone/push  | ⚠️ May timeout on large repos |
| WebSockets      | ❌ Usually not supported      |
| Background jobs | ❌ Limited                    |
| Custom domains  | ✅ Works                      |
| SSL             | ✅ Via AutoSSL                |

---

## Recommended Alternative

For a Git server, we strongly recommend:

1. **VPS** (DigitalOcean, Linode, Vultr) - Full control
2. **Docker** on any cloud provider - Easy deployment
3. **Vercel/Cloudflare** - For serverless approach

See [Docker Deployment Guide](/administration/deploy-docker/) for production setups.
