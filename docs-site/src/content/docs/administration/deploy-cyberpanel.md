---
title: "Deploy with CyberPanel"
description: "Deploy OpenCodeHub using CyberPanel with OpenLiteSpeed web server"
---

CyberPanel is a hosting control panel that uses OpenLiteSpeed (OLS) as its web server. This guide covers deploying OpenCodeHub on a CyberPanel server.

## Prerequisites

- CyberPanel installed on a VPS
- Root SSH access
- Domain pointed to your server
- PostgreSQL or MySQL available

---

## Step 1: Create Website in CyberPanel

1. Login to CyberPanel admin panel
2. Go to **Websites → Create Website**
3. Configure:
   - Domain: `git.yourdomain.com`
   - Email: your email
   - PHP: None (we'll use Node.js)
   - SSL: Issue SSL via Let's Encrypt

---

## Step 2: Install Node.js

CyberPanel doesn't include Node.js by default. Install via SSH:

```bash
# Connect via SSH as root
ssh root@your-server-ip

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify
node --version  # Should be 20.x
npm --version
```

---

## Step 3: Install PostgreSQL

```bash
# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE opencodehub;
CREATE USER opencodehub WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE opencodehub TO opencodehub;
\c opencodehub
GRANT ALL ON SCHEMA public TO opencodehub;
EOF
```

---

## Step 4: Clone and Setup Application

```bash
# Create app directory
mkdir -p /home/git.yourdomain.com/app
cd /home/git.yourdomain.com/app

# Clone repository
git clone https://github.com/swadhinbiswas/OpencodeHub.git .

# Install dependencies
npm install

# Create environment file
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
SITE_URL=https://git.yourdomain.com

# Database
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://opencodehub:your-secure-password@localhost:5432/opencodehub

# Security (generate with: openssl rand -hex 32)
JWT_SECRET=your-64-char-jwt-secret
SESSION_SECRET=your-64-char-session-secret
INTERNAL_HOOK_SECRET=your-64-char-hook-secret

# Storage
STORAGE_TYPE=local
STORAGE_PATH=./data/repos
EOF

# Build
npm run build

# Initialize database
npm run db:push

# Create admin user
npm run scripts/seed-admin.ts
```

---

## Step 5: Configure OpenLiteSpeed

CyberPanel uses OpenLiteSpeed. We need to set up reverse proxy.

### Create Proxy Configuration

1. SSH into server
2. Edit the vhost config:

```bash
nano /usr/local/lsws/conf/vhosts/git.yourdomain.com/vhconf.conf
```

3. Add or modify the config:

```apache
docRoot                   $VH_ROOT/public_html
enableGzip                1

context / {
  type                    proxy
  handler                 localhost:3000
  addDefaultCharset       off
}

rewrite  {
  enable                  1
  autoLoadHtaccess        1
}
```

### Alternative: Via CyberPanel UI

1. Go to **Websites → List Websites**
2. Click on your website → **vHost Conf**
3. Add the proxy context as shown above
4. Click **Save**

### Restart LiteSpeed

```bash
systemctl restart lsws
```

---

## Step 6: Setup Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start OpenCodeHub
cd /home/git.yourdomain.com/app
pm2 start dist/server/entry.mjs --name opencodehub

# Save process list
pm2 save

# Setup startup script
pm2 startup systemd
# Run the command it outputs
```

---

## Step 7: Configure Firewall

CyberPanel uses firewalld:

```bash
# Allow necessary ports (if not already open)
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --reload
```

:::note
Port 3000 only needs to be open if accessing directly. With the reverse proxy, only 80/443 need to be open.
:::

---

## SSL Configuration

CyberPanel can automatically issue SSL via Let's Encrypt:

1. Go to **SSL → Manage SSL**
2. Select your website
3. Click **Issue SSL**

The SSL will be automatically configured for OpenLiteSpeed.

---

## OpenLiteSpeed Optimizations

### Increase Timeouts for Git Operations

Edit `/usr/local/lsws/conf/vhosts/git.yourdomain.com/vhconf.conf`:

```apache
context / {
  type                    proxy
  handler                 localhost:3000
  addDefaultCharset       off
  
  # Extended timeouts for git operations
  extraparam {
    ProxyTimeout          600
  }
}
```

### Enable WebSocket Support

```apache
context /ws {
  type                    proxy
  handler                 localhost:3000
  addDefaultCharset       off
  
  extraparam {
    WebSocket             1
  }
}
```

---

## Monitoring with CyberPanel

### View Logs

1. Go to **Logs → Access Logs** or **Error Logs**
2. Select your website

### PM2 Monitoring

```bash
# View status
pm2 status

# View logs
pm2 logs opencodehub

# Monitor resources
pm2 monit
```

---

## Troubleshooting

### 503 Bad Gateway

1. Check if Node.js app is running: `pm2 status`
2. Verify port 3000 is listening: `netstat -tlnp | grep 3000`
3. Check LiteSpeed error logs: `/usr/local/lsws/logs/error.log`

### Application Crashes on Restart

```bash
# Check PM2 logs
pm2 logs opencodehub --lines 100

# Restart application
pm2 restart opencodehub
```

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql -U opencodehub -h localhost -d opencodehub
```

---

## Updating OpenCodeHub

```bash
cd /home/git.yourdomain.com/app

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Rebuild
npm run build

# Run migrations
npm run db:push

# Restart
pm2 restart opencodehub
```

---

## Comparison: OpenLiteSpeed vs Nginx

| Feature | OpenLiteSpeed | Nginx |
|---------|---------------|-------|
| Performance | Excellent | Excellent |
| .htaccess support | ✅ | ❌ |
| WebSocket | ✅ | ✅ |
| Configuration | GUI + files | Files only |
| Resource usage | Low | Very low |

Both work well for OpenCodeHub.

---

## Next Steps

- [Set up monitoring](/administration/monitoring/)
- [Configure backups](/administration/deploy-docker/#backup--restore)
- [Enable AI code review](/features/ai-review/)
