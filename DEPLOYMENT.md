# OpenCodeHub - Production Deployment Guide

## ✅ Production Readiness Status

**ALL CRITICAL SECURITY FIXES IMPLEMENTED**

OpenCodeHub is now **production-ready** with enterprise-grade security features.

---

## 🔒 Implemented Security Features

### 1. Rate Limiting ✅
**Location:** `src/middleware/rate-limit.ts`

**Protection:**
- Login attempts: 5 per 15 minutes
- API requests: 100 per minute
- Git operations: 200 per minute

**Applied To:**
- `/api/auth/login`
- `/api/auth/register`
- `/api/repos/[repoId]/branch-protection`

### 2. CSRF Protection ✅
**Location:** `src/middleware/csrf.ts`

**Method:** Double-submit cookie pattern
**Coverage:** All state-changing operations (POST/PUT/DELETE)

### 3. Input Validation ✅
**Location:** `src/lib/validation.ts`

**Schemas:**
- `RegisterUserSchema` - Username, email, password validation
- `BranchProtectionSchema` - Pattern and permission validation
- `CreateRepositorySchema`, `CreateIssueSchema`, `CreatePullRequestSchema`
- `StorageConfigSchema`, `GeneralConfigSchema`, `WebhookConfigSchema`

**Prevention:** SQL injection, XSS, invalid data attacks

### 4. Git Hook Authentication ✅
**Locations:**
- `src/lib/git.ts` - Hook installation with secrets
- `src/pages/api/internal/hooks/pre-receive.ts`
- `src/pages/api/internal/hooks/post-receive.ts`

**Security:** Shared secret in `X-Hook-Secret` header prevents unauthorized hook execution

### 5. Environment Validation ✅
**Location:** `src/lib/env-validation.ts`

**Validates:**
- Required secrets (JWT_SECRET, SESSION_SECRET, INTERNAL_HOOK_SECRET)
- Secret strength (32+ characters)
- URL formats (SITE_URL must be valid)
- Production-specific checks (HTTPS, no default secrets)

---

## 📋 Production Deployment Checklist

### Prerequisites
- [ ] PostgreSQL 14+ database configured
- [ ] Domain name with DNS configured
- [ ] SSL certificate (Let's Encrypt recommended)
- [ ] S3/R2 bucket for storage (or cloud storage alternative)

### Required Environment Variables

**Critical Security (MUST SET):**
```bash
# Generate with: openssl rand -hex 32
JWT_SECRET=<64-char-hex>
SESSION_SECRET=<64-char-hex>
INTERNAL_HOOK_SECRET=<64-char-hex>

# Production URL (MUST be HTTPS)
SITE_URL=https://git.yourcompany.com
NODE_ENV=production
```

**Database:**
```bash
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://user:password@host:5432/opencodehub
```

**Storage (Use cloud storage, not local):**
```bash
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub-production
STORAGE_REGION=us-east-1
S3_ACCESS_KEY=<your-access-key>
S3_SECRET_KEY=<your-secret-key>
```

**Optional but Recommended:**
```bash
# Error Monitoring
SENTRY_DSN=https://your-sentry-dsn

# Email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@yourcompany.com
SMTP_PASSWORD=<smtp-password>
SMTP_FROM=noreply@yourcompany.com

# Redis (for session management)
REDIS_URL=redis://localhost:6379
```

### Deployment Steps

```bash
# 1. Clone and configure
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub

# 2. Install dependencies
npm install  # or bun install

# 3. Create production .env
cp .env.example .env
nano .env  # Configure all production values

# 4. Validate environment
bun run src/lib/env-validation.ts
# Should output: ✅ Environment validation passed

# 5. Run database migrations
npm run db:push
# or generate versioned migrations:
npm run db:generate
npm run db:migrate

# 6. Create admin user
bun run scripts/seed-admin.ts
# Enter username, email, password when prompted

# 7. Build for production
npm run build

# 8. Start production server
npm start
```

### Docker Deployment (Recommended)

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    build: .
    restart: always
    ports:
      - "3000:3000"
    env_file: .env.production
    depends_on:
      - postgres
      - redis
    volumes:
      - ./data:/app/data
    environment:
      NODE_ENV: production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_DB: opencodehub
      POSTGRES_USER: opencodehub
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

```bash
# Deploy with Docker
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f app

# Create admin user in container
docker-compose exec app bun run scripts/seed-admin.ts
```

### Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/opencodehub
server {
    listen 443 ssl http2;
    server_name git.yourcompany.com;

    ssl_certificate /etc/letsencrypt/live/git.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/git.yourcompany.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy configuration
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support (for live updates)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Git operations (larger timeouts)
    location ~ ^/[^/]+/[^/]+\.git/ {
        proxy_pass http://localhost:3000;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        client_max_body_size 100M;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name git.yourcompany.com;
    return 301 https://$server_name$request_uri;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/opencodehub /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔍 Verification Steps

### 1. Environment Validation
```bash
bun run src/lib/env-validation.ts
```

**Expected Output:**
```
🔍 Validating environment configuration...
✅ Environment validation passed
```

### 2. Build Verification
```bash
npm run build
```

**Expected:** No errors, successful build output

### 3. Security Features Test

**Rate Limiting:**
```bash
# Try 6 login attempts rapidly - should get rate limited
for i in {1..6}; do
  curl -X POST https://git.yourcompany.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"login":"test","password":"wrong"}' \
    -w "\nStatus: %{http_code}\n"
done
```

**Expected:** First 5 return 401, 6th returns 429 (Too Many Requests)

**Hook Authentication:**
```bash
# Try without secret - should fail
curl -X POST https://git.yourcompany.com/api/internal/hooks/post-receive \
  -H "Content-Type: application/json" \
  -d '{"oldrev":"abc","newrev":"def","refname":"refs/heads/main"}'
```

**Expected:** 401 Unauthorized

### 4. Health Check
```bash
curl https://git.yourcompany.com/api/health
```

**Expected:**
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "storage": "ok"
  },
  "uptime": 12345,
  "version": "1.0.0"
}
```

---

## 🐛 Troubleshooting

### Rate Limit Issues
**Problem:** Users getting rate limited legitimately

**Solution:**
```bash
# Increase limits in .env
RATE_LIMIT_AUTH=10  # Increase from 5
RATE_LIMIT_API=200  # Increase from 100
```

### Git Hooks Not Working
**Problem:** Push succeeds but hooks don't trigger

**Checklist:**
1. Verify `SITE_URL` is set correctly
2. Verify `INTERNAL_HOOK_SECRET` matches in .env
3. Check hook files exist: `data/repos/owner/repo.git/hooks/post-receive`
4. Verify hooks are executable: `chmod +x hooks/*`
5. Check application logs for hook errors

### Database Connection Errors
**Problem:** Can't connect to database

**Solutions:**
```bash
# Test connection
psql $DATABASE_URL

# Check PostgreSQL is running
sudo systemctl status postgresql

# Verify credentials in .env
echo $DATABASE_URL
```

### Storage Upload Failures
**Problem:** Can't upload files

**Solutions:**
1. Test S3 credentials:
```bash
aws s3 ls s3://$STORAGE_BUCKET --profile opencodehub
```

2. Verify bucket permissions (needs: s3:PutObject, s3:GetObject, s3:DeleteObject)

3. Check CORS configuration if using direct uploads

---

## 📊 Monitoring & Maintenance

### Database Backups
```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL | gzip > /backups/opencodehub_$DATE.sql.gz

# Retain last 30 days
find /backups -name "opencodehub_*.sql.gz" -mtime +30 -delete
```

Add to crontab:
```
0 2 * * * /usr/local/bin/backup-opencodehub.sh
```

### Log Rotation
```bash
# /etc/logrotate.d/opencodehub
/var/log/opencodehub/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 www-data www-data
    sharedscripts
    postrotate
        systemctl reload opencodehub
    endscript
}
```

### Metrics to Monitor
- Request rate (should stay within rate limits)
- Failed login attempts (detect brute force)
- Database connection pool usage
- Storage usage
- Memory and CPU usage
- Error rate (4xx, 5xx responses)

---

## 🚀 Post-Deployment

### Create Organizations
1. Login as admin
2. Navigate to Settings → Organizations
3. Create organization
4. Invite team members

### Configure Branch Protection
1. Go to Repository → Settings → Branches
2. Add protection rule for `main`:
   - Require PR: ✅
   - Required approvals: 2
   - Dismiss stale reviews: ✅

### Setup CI/CD Runners
```bash
# Start self-hosted runner
docker run -d \
  --name opencodehub-runner \
  -e SERVER_URL=https://git.yourcompany.com \
  -e RUNNER_TOKEN=<from-admin-panel> \
  opencodehub/runner:latest
```

### Enable Email Notifications
Configure SMTP in .env, then test:
```bash
curl -X POST https://git.yourcompany.com/api/admin/test-email \
  -H "Cookie: och_session=<your-session>" \
  -H "Content-Type: application/json" \
  -d '{"to":"admin@yourcompany.com"}'
```

---

## 📚 Additional Resources

- **API Documentation:** https://git.yourcompany.com/api/docs
- **Admin Panel:** https://git.yourcompany.com/admin
- **User Guide:** See README.md
- **Security Best Practices:** See production_analysis.md

---

## ✅ Production Readiness Confirmed

All critical security features are implemented and tested:
- ✅ Rate limiting (brute force protection)
- ✅ CSRF protection (cross-site attacks)
- ✅ Input validation (injection prevention)
- ✅ Hook authentication (git security)
- ✅ Environment validation (configuration safety)

**OpenCodeHub is ready for production deployment!** 🎉
