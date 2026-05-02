# Deploy OpenCodeHub on cPanel Hosting

> **Difficulty:** Intermediate | **Time:** 45-60 minutes | **Method:** Manual Node.js + PostgreSQL

**cPanel** is widely used on shared hosting and VPS. While cPanel doesn't natively support Docker, you can deploy OpenCodeHub using **Node.js Selector** (if CloudLinux is available) or **Passenger** + **PM2**.

---

## Prerequisites

- cPanel hosting with **SSH access** (essential)
- **Node.js 20+** available (check via cPanel → Software → Select Node.js Version)
- **PostgreSQL** or ability to install it (via cPanel → PostgreSQL Databases)
- Minimum **2 CPU cores, 4GB RAM**
- A domain/subdomain pointed to your hosting (e.g., `git.yourdomain.com`)

---

## Step 1: Prepare Your cPanel Account

### 1.1 Enable SSH Access

1. Log into cPanel
2. Go to **Security** → **SSH Access**
3. Click **Manage SSH Keys** → **Generate a New Key**
4. Download the private key and authorize it
5. Connect via terminal:
   ```bash
   ssh cpaneluser@yourdomain.com -p 22
   ```

### 1.2 Set Up Domain/Subdomain

1. In cPanel, go to **Domains** → **Create a New Domain**
2. Enter: `git.yourdomain.com`
3. Document Root: `public_html/git` (or just `public_html`)
4. Enable SSL (Let's Encrypt) in **SSL/TLS Status**

---

## Step 2: Install PostgreSQL

### Option A: cPanel PostgreSQL (Shared Hosting)

1. In cPanel, go to **Databases** → **PostgreSQL Databases**
2. If not available, ask your host to enable it, OR use **SQLite** (not recommended for production):
   ```bash
   # SQLite is file-based, no server needed
   # Set DATABASE_DRIVER=sqlite in .env later
   ```

3. Create a database:
   - Database name: `cpaneluser_opencodehub`
   - Username: `cpaneluser_och`
   - Password: `<strong-password>`

4. Note the connection details. The host is usually `localhost`.

### Option B: Self-Install PostgreSQL (VPS with cPanel)

If you have root access on a VPS:

```bash
# Install PostgreSQL
sudo dnf install postgresql16-server postgresql16-contrib  # AlmaLinux/Rocky
sudo /usr/pgsql-16/bin/postgresql-16-setup initdb
sudo systemctl enable --now postgresql-16

# Create database
sudo -u postgres psql -c "CREATE USER opencodehub WITH PASSWORD 'strongpassword';"
sudo -u postgres psql -c "CREATE DATABASE opencodehub OWNER opencodehub;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE opencodehub TO opencodehub;"
```

---

## Step 3: Install Node.js and Bun

### 3.1 Check Node.js Version

In cPanel:
1. Go to **Software** → **Select Node.js Version** (if CloudLinux)
2. Select **Node.js 20.x** or higher
3. Click **Set as Current**

If cPanel doesn't have Node.js selector:

```bash
# SSH into your account
ssh cpaneluser@yourdomain.com

# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc

# Install Node.js 20
nvm install 20
nvm use 20
node -v  # Should show v20.x.x
```

### 3.2 Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun -v
```

---

## Step 4: Deploy OpenCodeHub

### 4.1 Clone Repository

```bash
cd ~
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub
```

### 4.2 Create Production Environment File

```bash
cp .env.example .env
nano .env
```

Edit `.env` with your cPanel settings:

```bash
# Database
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://cpaneluser_och:YOUR_PASSWORD@localhost:5432/cpaneluser_opencodehub

# For SQLite fallback (if PostgreSQL unavailable)
# DATABASE_DRIVER=sqlite
# DATABASE_URL=file:./data/opencodehub.db

# Secrets (generate with: openssl rand -hex 32)
JWT_SECRET=your-64-char-hex-secret
SESSION_SECRET=your-64-char-hex-secret
INTERNAL_HOOK_SECRET=your-64-char-hex-secret
CRON_SECRET=your-64-char-hex-secret
RUNNER_SECRET=your-64-char-hex-secret
WORKFLOW_SECRET_ENCRYPTION_KEY=your-64-char-hex-secret

# Site URL (MUST be HTTPS in production)
SITE_URL=https://git.yourdomain.com
NODE_ENV=production

# Storage (local is fine for single-server cPanel)
STORAGE_DRIVER=local
STORAGE_PATH=./data/storage
REPOS_PATH=./data/repos

# Redis (skip if not available, use file sessions)
# REDIS_URL=redis://localhost:6379

# Skip Redis check during build
SKIP_REDIS_CHECK=1
```

> **IMPORTANT:** On cPanel shared hosting, you likely don't have Redis. OpenCodeHub will work without it using in-memory sessions (restart clears sessions) or you can use SQLite for sessions.

### 4.3 Install Dependencies

```bash
# Install dependencies (with retry in case of network issues)
for i in 1 2 3; do
  bun install --frozen-lockfile && break
  echo "Attempt $i failed, retrying in 10s..."
  sleep 10
done
```

If bun install fails due to native modules:
```bash
# Some cPanel environments lack build tools
# Install with npm instead for better compatibility
npm install
```

### 4.4 Build the Application

```bash
export SKIP_REDIS_CHECK=1
bun run build
```

This creates the `dist/` directory with the production build.

### 4.5 Initialize Database

```bash
# Push schema to database
bun run db:push

# Or generate and run migrations
bun run db:generate
bun run db:migrate
```

### 4.6 Create Admin User

```bash
bun run scripts/seed-admin.ts
```
Enter username, email, and password when prompted.

---

## Step 5: Set Up Process Manager (PM2)

cPanel doesn't keep Node.js apps running by default. Use PM2:

### 5.1 Install PM2

```bash
npm install -g pm2
```

### 5.2 Create PM2 Config

```bash
cat > ~/OpenCodeHub/ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'opencodehub',
    script: './dist/server/entry.mjs',
    cwd: '/home/cpaneluser/OpenCodeHub',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '127.0.0.1'
    },
    error_file: '/home/cpaneluser/logs/opencodehub-error.log',
    out_file: '/home/cpaneluser/logs/opencodehub-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    restart_delay: 3000,
    max_restarts: 5,
    min_uptime: '10s',
    watch: false,
    autorestart: true
  }]
};
EOF
```

> Replace `cpaneluser` with your actual cPanel username.

### 5.3 Create Log Directory

```bash
mkdir -p ~/logs
```

### 5.4 Start with PM2

```bash
cd ~/OpenCodeHub
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

The `startup` command will output a command to run with `sudo` (if you have root). On shared hosting without root, add PM2 to your `.bash_profile`:

```bash
echo 'pm2 resurrect' >> ~/.bash_profile
```

---

## Step 6: Configure Reverse Proxy

### 6.1 Using .htaccess (Apache - Most Common)

In your `public_html` directory, create/edit `.htaccess`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Redirect HTTP to HTTPS
  RewriteCond %{HTTPS} off
  RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]

  # Proxy all requests to Node.js app
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
</IfModule>

# Enable proxy modules (host must have these enabled)
<IfModule mod_proxy.c>
  ProxyPass / http://127.0.0.1:3000/
  ProxyPassReverse / http://127.0.0.1:3000/

  # WebSocket support
  RewriteCond %{HTTP:Upgrade} websocket [NC]
  RewriteCond %{HTTP:Connection} upgrade [NC]
  RewriteRule ^/?(.*) "ws://127.0.0.1:3000/$1" [P,L]
</IfModule>

# Increase limits for Git operations
<IfModule mod_reqtimeout.c>
  RequestReadTimeout header=20-40,minrate=500
  RequestReadTimeout body=10,minrate=500
</IfModule>

LimitRequestBody 104857600
```

> **Note:** Some shared hosts disable `mod_proxy`. If `.htaccess` proxy doesn't work, ask your host to enable it, OR use the Node.js Selector method below.

### 6.2 Using cPanel Node.js Selector (CloudLinux)

If your host has CloudLinux with Node.js Selector:

1. In cPanel, go to **Software** → **Setup Node.js App**
2. Click **Create Application**
3. Configuration:
   ```
   Node.js Version: 20.x
   Application Mode: Production
   Application Root: /home/cpaneluser/OpenCodeHub
   Application URL: git.yourdomain.com
   Application Startup File: dist/server/entry.mjs
   ```
4. Click **Create**
5. In **Environment Variables**, add all variables from your `.env`
6. Click **Save**
7. Click **Restart**

### 6.3 Using Nginx Reverse Proxy (VPS with cPanel + Nginx)

If your cPanel server uses Nginx:

```nginx
# In cPanel → Nginx Manager → Custom Configuration
# OR via SSH in /etc/nginx/conf.d/opencodehub.conf

server {
    listen 80;
    server_name git.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name git.yourdomain.com;

    ssl_certificate /path/to/ssl.crt;
    ssl_certificate_key /path/to/ssl.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location ~ ^/[^/]+/[^/]+\.git/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        client_max_body_size 100M;
    }
}
```

---

## Step 7: Verify Deployment

### 7.1 Check App is Running

```bash
pm2 status
pm2 logs opencodehub
```

### 7.2 Test Health Endpoint

```bash
curl http://127.0.0.1:3000/api/health
```

### 7.3 Test from Browser

Visit `https://git.yourdomain.com` and log in.

---

## Step 8: Git SSH Access (Advanced)

cPanel shared hosting typically doesn't allow custom SSH ports. For Git over SSH, you have options:

### Option A: Use Git over HTTPS (Recommended for cPanel)

OpenCodeHub supports Git over HTTP(S) out of the box. Users can:
```bash
git clone https://git.yourdomain.com/username/repo.git
```

### Option B: Use a Different Port for SSH Git

If your host allows additional ports:

```bash
# In .env
GIT_SSH_PORT=2222

# Start SSH git server
bun run git:start
```

Add to PM2 config:
```javascript
apps: [
  {
    name: 'opencodehub',
    script: './dist/server/entry.mjs',
    // ... main app config
  },
  {
    name: 'opencodehub-ssh',
    script: './scripts/ssh-server.ts',
    cwd: '/home/cpaneluser/OpenCodeHub',
    interpreter: 'bun'
  }
]
```

> **Note:** Most shared hosts block non-standard ports. HTTPS Git is the safest option.

---

## Maintenance

### Update OpenCodeHub

```bash
cd ~/OpenCodeHub
git pull origin main

# Rebuild
export SKIP_REDIS_CHECK=1
bun install
bun run build
bun run db:push

# Restart
pm2 restart opencodehub
```

### Backup

```bash
# Database backup (PostgreSQL)
pg_dump $DATABASE_URL > ~/backups/opencodehub-$(date +%Y%m%d).sql

# File backup
cd ~
tar czf backups/opencodehub-files-$(date +%Y%m%d).tar.gz OpenCodeHub/data
```

Set up a cron job in cPanel → **Cron Jobs**:
```bash
# Daily at 2 AM
0 2 * * * /home/cpaneluser/.nvm/versions/node/v20.x.x/bin/node /home/cpaneluser/scripts/backup.js
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Forbidden 403" error** | Check file permissions. Directories should be 755, files 644. |
| **Node.js app not starting** | Check logs: `pm2 logs`. Verify Node.js version is 20+. |
| **Database connection failed** | Verify PostgreSQL is running and credentials are correct. Check if `localhost` is the right host (some cPanel uses `127.0.0.1`). |
| **Build fails with memory error** | cPanel shared hosting often limits memory. Try `NODE_OPTIONS="--max-old-space-size=1024" bun run build`. |
| **Git push fails** | Use HTTPS Git instead of SSH. cPanel shared hosting rarely allows custom SSH ports. |
| **Static assets not loading** | Ensure `dist/` folder is built and the reverse proxy is forwarding all requests correctly. |
| **Session lost on restart** | Without Redis, sessions are in-memory. For persistence, ask host to enable Redis, or use PostgreSQL session store (requires code change). |

---

## Limitations on cPanel Shared Hosting

| Feature | Shared Hosting | VPS/Dedicated |
|---------|---------------|---------------|
| Docker | Not available | Available |
| Redis | Rarely available | Available |
| Custom SSH ports | Blocked | Available |
| CI/CD Runner | Not possible (needs Docker) | Available |
| Resource limits | Low (1-2GB RAM) | Configurable |
| Storage adapters | Local only | All adapters |

For full functionality, consider upgrading to a VPS or using Coolify/Docker deployment instead.

---

## Next Steps

- [Configure Email (SMTP)](../administration/configuration.md#email)
- [Enable Branch Protection](../guides/branch-protection.md)
- [Troubleshooting Common Issues](../support/troubleshooting.md)
