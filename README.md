# OpenCodeHub

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="public/logo-light.png">
    <img src="public/logo-light.png" alt="OpenCodeHub Logo" width="400"/>
  </picture>
  <br>
</p>

<p align="center">
  <strong>The self-hosted Git platform for high-velocity teams.</strong><br>
  Built for stacked PRs, AI code review, and enterprise security.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/v/opencodehub-cli?style=flat-square&color=bd93f9&label=CLI" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/swadhinbiswas/OpenCodeHub?style=flat-square&color=50fa7b" alt="License"></a>
  <a href="https://github.com/swadhinbiswas/OpenCodeHub/actions"><img src="https://img.shields.io/github/actions/workflow/status/swadhinbiswas/OpenCodeHub/ci.yml?branch=main&style=flat-square&color=8be9fd" alt="Build Status"></a>
  <a href="https://docker.com"><img src="https://img.shields.io/badge/docker-ready-blue?style=flat-square&logo=docker" alt="Docker"></a>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-och-cli---command-line-interface">CLI</a> •
  <a href="#-advanced-features">Advanced Features</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

## 🎉 Production Ready!

**All critical security vulnerabilities are now fixed. OpenCodeHub is production-ready!** 🎊

✅ **Rate Limiting** - Prevents brute force attacks
✅ **CSRF Protection** - Cross-site request forgery defense
✅ **Input Validation** - SQL injection & XSS prevention
✅ **Hook Authentication** - Secure git operations
✅ **Environment Validation** - Safe configuration management

📚 **See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment guide** with SSL setup, Nginx configuration, monitoring, database backups, and production best practices.

---

## 🚀 Features

### Git Hosting & Collaboration

- **Full Git Support** - SSH and HTTP/HTTPS protocols with authentication
- **Repository Management** - Create, fork, archive, and transfer repositories
- **Branch Protection** - Enforce PR requirements, approvals, and code review policies
- **Pull Requests** - Code review with inline comments and approval workflows
- **Issues & Milestones** - Bug tracking with labels, assignees, and custom fields
- **Wiki** - Built-in documentation with markdown support
- **Organizations** - Team management with role-based access control (RBAC)

### CI/CD & Automation

- **GitHub Actions Compatible** - Run workflows defined in `.github/workflows/`
- **Self-hosted Runners** - Docker-based job execution with artifact support
- **Merge Queue** - Automated PR merge management with conflict detection
- **Webhooks** - Real-time event notifications to external services
- **Secrets Management** - Encrypted storage for CI/CD credentials

### Security Features ✅

- **Rate Limiting** - Prevents brute force attacks (5 login attempts per 15min)
- **CSRF Protection** - Double-submit cookie pattern for all state-changing operations
- **Input Validation** - Zod schemas prevent injection attacks
- **Hook Authentication** - Shared secrets protect internal git hooks
- **Session Management** - Automatic expiration and rotation
- **Audit Logging** - Complete activity tracking for compliance

### Modern Tech Stack

- **Astro + React** - Fast, modern frontend with island architecture
- **TailwindCSS + shadcn/ui** - Beautiful, accessible UI components
- **Universal Database Adapter** - PostgreSQL, MySQL, SQLite, MongoDB, Turso, PlanetScale
- **Flexible Storage** - Local, S3, MinIO, Google Drive, Azure Blob, R2
- **Production-Ready** - Rate limiting, CSRF, input validation, error monitoring
- **Comprehensive Docs** - Integrated documentation site with guides and API reference

---

---

## 🏗 Architecture

<p align="center">
  <img src="public/architecture.svg" alt="System Architecture" width="800">
</p>

OpenCodeHub is built on a modern, scalable architecture designed for performance and flexibility.

- **Frontend**: Astro + React for high-performance UI.
- **Backend API**: tRPC + Node.js for type-safe communication.
- **Git Server**: Custom implementation over standard Git protocols (HTTP/SSH).
- **Database**: Drizzle ORM supporting PostgreSQL, MySQL, and SQLite.
- **Storage**: Pluggable storage system (S3, R2, G-Drive, Local).

---

## 📦 Quick Start

### Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **Database**: PostgreSQL 14+ (recommended) / MySQL 8+ / SQLite 3.35+
- **Git** 2.30+
- **Docker** (optional, for CI/CD runners)

### Installation (5 minutes)

```bash
# 1. Clone the repository
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub

# 2. Install dependencies
npm install
# or
bun install

# 3. Set up environment
cp .env.example .env

# 4. Configure your .env file (see Configuration section)
nano .env  # Set at minimum: JWT_SECRET, SESSION_SECRET, INTERNAL_HOOK_SECRET, SITE_URL

# 5. Run database migrations
npm run db:push
# or generate migrations for version control:
npm run db:generate

# 6. Seed an admin user
bun run scripts/seed-admin.ts
# Enter username, email, password when prompted

# 7. Start development server
npm run dev
# Application available at http://localhost:3000
```

### Using Docker (Recommended for Production)

```bash
# 1. Clone and configure
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub
cp .env.example .env

# 2. Edit .env with production values (see Production Deployment section)

# 3. Start services
docker-compose up -d

# 4. Create admin user
docker-compose exec app bun run scripts/seed-admin.ts

# Access at http://localhost:3000
```

---

## 🎯 OCH CLI - Command Line Interface

Powerful CLI for stack-first PR workflows.

### Installation

```bash
# Install globally
npm install -g opencodehub-cli

# Or use with npx
npx opencodehub-cli

# Verify installation
och --version
```

### Quick Setup

```bash
# 1. Login to your OpenCode Hub instance
och auth login --url https://git.yourcompany.com

# 2. Navigate to your repository
cd your-repo

# 3. Initialize
och init --url https://git.yourcompany.com
```

### CLI Commands Reference

**Authentication:**

```bash
och auth login              # Interactive login
och auth login --token TOKEN  # Login with token
och auth logout             # Logout
och auth whoami             # Show current user
```

**Stack Management:**

```bash
och stack create \u003cname\u003e      # Create new stacked branch
och stack view              # View current stack (alias: ls)
och stack submit            # Push and create PRs
och stack submit --draft    # Create as draft PRs
och stack sync              # Rebase stack on latest
och stack reorder           # Reorder branches in stack
```

**Repository:**

```bash
och init                    # Initialize repo for OpenCodeHub
och sync                    # Bidirectional sync with remote
och status                  # Show stack status (alias: st)
```

---

## 🚀 Advanced Features

### 📚 Stacked Pull Requests

**Ship faster by breaking large features into reviewable chunks.**

#### Why Stacked PRs?

- **Faster Reviews**: Smaller, focused PRs get reviewed quicker
- **Parallel Development**: Build on unmerged PRs while waiting for review
- **Clean History**: Each PR represents one logical change
- **Risk Reduction**: Deploy incrementally, rollback easily

#### How It Works

![Stacked PR Workflow](/stack-workflow.svg)
<br>

Each PR builds on the previous one. When #123 merges, #124 automatically rebases.

#### Creating a Stack

**Using CLI:**

```bash
# 1. Create base branch
git checkout -b feature/auth
git commit -m "Add user table schema"
och stack create auth-schema

# 2. Create stacked branch
och stack create auth-service
git commit -m "Add authentication service"

# 3. Create final layer
och stack create auth-ui
git commit -m "Add login UI"

# 4. Submit entire stack
och stack submit
```

**Using Web UI:**

1. Create first PR normally
2. When creating second PR, select "Stack on PR #123"
3. System tracks dependencies automatically

#### Stack Features

✅ **Auto-Rebasing**: When base PR merges, dependent PRs rebase automatically
✅ **Dependency Visualization**: See entire stack in PR view
✅ **Smart Merge Queue**: Merges in correct order
✅ **Conflict Detection**: Alerts on rebase conflicts

---

### 🤖 AI Code Review

**Get instant feedback from AI reviewers powered by GPT-4 or Claude.**

#### Setup

**1. Configure AI Provider:**

```env
# In .env
AI_PROVIDER=openai  # or anthropic
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
```

**2. Enable for Repository:**
Navigate to **Repository → Settings → AI Review**

- ✅ Enable AI Review
- Set review triggers (on PR open, on push, manual)
- Configure review rules

#### What AI Reviews Catch

🔍 **Security Vulnerabilities**

- SQL injection risks
- XSS vulnerabilities
- Authentication bypasses
- Secrets in code

⚡ **Performance Issues**

- N+1 queries
- Inefficient algorithms
- Memory leaks
- Blocking operations

📝 **Code Quality**

- Best practice violations
- Code smells
- Incomplete error handling
- Missing documentation

🐛 **Potential Bugs**

- Null pointer exceptions
- Race conditions
- Off-by-one errors
- Logic flaws

#### Using AI Review

**Automatic (Recommended):**
AI review runs automatically on every PR based on configured triggers.

**Manual:**

```bash
# Via CLI
och review ai \u003cPR_NUMBER\u003e

# Via web UI: Click "Request AI Review" button on PR
```

#### Review Output

AI provides:

- **Severity Score**: Critical / High / Medium / Low / Info
- **Specific Line Comments**: Inline code suggestions
- **Summary Report**: Overall code quality assessment
- **Fix Suggestions**: Actionable improvements

**Example:**

```text
🔴 CRITICAL: SQL Injection Vulnerability
File: src/api/users.ts:45
Issue: User input directly concatenated into SQL query
Fix: Use parameterized queries or ORM

🟡 MEDIUM: Performance Concern
File: src/lib/data.ts:128
Issue: N+1 query in loop (1000+ iterations)
Fix: Use batch loading or eager loading
```

---

### 🔀 Smart Merge Queue

**Stack-aware merge queue with automatic conflict resolution and CI optimization.**

#### Features

**Stack-Aware Merging:**

- Detects PR dependencies
- Merges in correct order automatically
- Handles entire stacks atomically

**CI Optimization:**

- Batches compatible PRs
- Runs CI once for multiple PRs
- Reduces CI cost by ~60%

**Automatic Rebasing:**

- Detects conflicts early
- Auto-rebases on base changes
- Alerts author on conflicts

**Smart Ordering:**

- Priority-based queue
- Dependency resolution
- Hotfix fast-tracking

#### Using Merge Queue

**Add to Queue:**

```bash
# Via CLI
och queue add \u003cPR_NUMBER\u003e

# Via Web UI
Click "Add to Merge Queue" button on approved PR
```

**Queue Status:**

```bash
# View queue
och queue list

# Output:
Position  PR     Title                Status
1         #125   Add login UI         ⏳ Running CI
2         #124   Auth service         ⏸️  Waiting (depends on #123)
3         #123   Database schema      ✅ Ready to merge
```

**How It Works:**

1. **PR Added**: Queue analyzes dependencies
2. **Position Assigned**: Ordered by priority and dependencies
3. **CI Running**: Runs tests in parallel where possible
4. **Auto-Merge**: Merges when ready, rebases dependents
5. **Notification**: Author notified on completion

#### Queue Configuration

**Repository → Settings → Merge Queue:**

- **Require CI**: Only merge if all checks pass
- **Batch Window**: Wait time to batch PRs (default: 5min)
- **Max Batch Size**: Max PRs to merge together (default: 3)
- **Auto-Rebase**: Rebase on conflicts vs. remove from queue

---

### 📊 Developer Metrics

**Track team velocity, review efficiency, and identify bottlenecks.**

#### Available Metrics

**PR Velocity:**

- PRs merged per week
- Average time to merge
- Stack success rate
- Review cycle time

**Review Efficiency:**

- Average review time
- Reviews per day
- Review quality score
- Reviewer responsiveness

**Team Performance:**

- Lines changed per PR
- PR size distribution
- Revert rate
- CI success rate

**Stack Metrics:**

- % PRs that use stacks
- Average stack depth
- Stack merge success rate
- Time saved vs. monolithic PRs

#### Viewing Metrics

**Personal Dashboard:**

```text
/metrics/me
```

**Team Dashboard (Admin):**

```text
/admin/metrics
```

**Via CLI:**

```bash
och metrics show
och metrics show --user @username
och metrics show --repo owner/repo
```

#### Example Metrics View

```text
📊 Your Metrics (Last 30 Days)

PR Velocity
├─ PRs Merged         ━━━━━━━━━━━━━━ 24 (+12%)
├─ Avg Time to Merge  ━━━━━━━━━━━━━━ 8.2 hours (-3h)
└─ Stack Usage        ━━━━━━━━━━━━━━ 65% (+15%)

Review Efficiency
├─ Reviews Given      ━━━━━━━━━━━━━━ 18
├─ Avg Review Time    ━━━━━━━━━━━━━━ 22 min
└─ Approval Rate      ━━━━━━━━━━━━━━ 94%
```

---

### 💬 Slack Notifications

**Get actionable PR notifications directly in Slack.**

#### Setup

**1. Create Slack App:**

1. Go to https://api.slack.com/apps
2. Create New App → From Scratch
3. Add OAuth Scopes:
   - `chat:write`
   - `chat:write.public`
   - `users:read`
4. Install to workspace

**2. Connect to OpenCodeHub:**
Navigate to **Admin → Integrations → Slack**

```
Workspace Name: Your Team
Bot Token: xoxb-...
Signing Secret: ...
```

**3. Map Channels:**
**Repository → Settings → Slack**

```
#engineering     → All PR events
#deployments     → Merges only
#security        → Security findings
```

**4. Map Users (Optional):**
Users can link their Slack account:
**Settings → Integrations → Connect Slack**

#### Notification Types

**PR Events:**

- 🎉 PR opened
- ✅ PR approved
- 🔀 PR merged
- ❌ PR closed
- 💬 Review requested
- 🔴 Changes requested

**CI/CD Events:**

- ✅ Build passed
- ❌ Build failed
- 🚀 Deployment started
- ✅ Deployment successful

**Code Review:**

- 🤖 AI review completed
- 🔍 Security issue found
- ⚠️ Performance concern

**Merge Queue:**

- ⏭️ Added to queue
- ✅ Merged from queue
- ⚠️ Removed (conflict)

#### Interactive Actions

Notifications include action buttons:

```
[swadhin] opened PR#125: Add login UI
Stack: #123 → #124 → #125  •  files →32  •  LoC +420/-18

[Approve] [Request Changes] [View PR] [Add to Queue]
```

Click buttons to:

- Approve/reject directly from Slack
- Request changes with comment
- Add to merge queue
- View full PR

#### Discord & Microsoft Teams

OpenCodeHub also supports incoming webhooks for Discord and Microsoft Teams.

**Setup:**
1. **Repository → Settings → Webhooks**
2. Create a new webhook
3. Select **Discord** or **Microsoft Teams** as the type
4. Paste your webhook URL
5. Select triggers (PR events, Push events, etc.)

---

## 💡 Workflow Examples

### Example 1: Complete Stacked PR Flow

```bash
# 1. Start new feature
git checkout main
git pull
git checkout -b feature/user-profiles

# 2. First PR: Database layer
git add migrations/
git commit -m "Add user profile tables"
och stack create profile-db
och stack submit

# → Creates PR #301

# 3. Second PR: Backend API
git add src/api/profiles/
git commit -m "Add profile API"
och stack create profile-api
och stack submit

# → Creates PR #302 (stacked on #301)

# 4. Third PR: Frontend
git add src/pages/profile/
git commit -m "Add profile UI"
och stack create profile-ui
och stack submit

# → Creates PR #303 (stacked on #302)

# 5. View stack
och stack view
```

**Output:**

```
📚 Current Stack

main (base)
 └─ #301: profile-db ✅ Approved
     └─ #302: profile-api  🔍 In Review
         └─ #303: profile-ui ⏳ AI Review Running
```

### Example 2: Using AI Review + Merge Queue

```bash
# 1. Create PR
git push origin feature-branch

# 2. Request AI review
och review ai 304

# 3. Fix AI suggestions
# ... make changes based on review ...
git commit -m "Fix security issues from AI review"
git push

# 4. Get human review
# Team reviews via web UI

# 5. Add to merge queue when approved
och queue add 304

# Queue handles:
# - Waiting for CI
# - Merging when ready
# - Notifying on Slack
```

### Example 3: Team Collaboration

```bash
# Developer A: Creates base
git checkout -b api/payments
# ... implements payment models ...
git commit -m "Add payment models"
git push

# Developer B: Builds on A's work (before merge!)
git checkout api/payments
git checkout -b api/payment-processing
# ... implements payment processing ...
git commit -m "Add payment processing"
git push
# Create PR stacked on A's PR

# Developer C: Builds on B's work
git checkout api/payment-processing
git checkout -b ui/payment-form
# ... implements payment UI ...
```

**Result**: 3 parallel PRs, all reviewed separately, merged in order.

---

## 📖 Additional Resources

- **Full CLI Reference**: `cli/README.md`
- **API Documentation**: `/api/docs`
- **Stacked PR Guide**: `/docs#stacked-prs`
- **Slack Integration Guide**: `/docs#slack`

---

## ⚙️ Configuration

### Critical Environment Variables

These **MUST** be set before deploying to production:

```env
# Security (CRITICAL - Generate strong secrets!)
JWT_SECRET=<run: openssl rand -hex 32>
SESSION_SECRET=<run: openssl rand -hex 32>
INTERNAL_HOOK_SECRET=<run: openssl rand -hex 32>

# Application URLs (CRITICAL)
SITE_URL=https://your-domain.com  # Must be HTTPS in production
PORT=3000
HOST=0.0.0.0

# CI/CD Runner Security (CRITICAL)
# Must match the secret used by your runners
RUNNER_SECRET=<run: openssl rand -hex 32>
```

### Database Configuration

**PostgreSQL (Recommended for Production):**

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/opencodehub
```

**MySQL:**

```env
DATABASE_DRIVER=mysql
DATABASE_URL=mysql://user:password@localhost:3306/opencodehub
```

**SQLite (Development Only):**

```env
DATABASE_DRIVER=sqlite
DATABASE_URL=./data/opencodehub.db
```

### Storage Configuration

Storage can be configured via Admin Panel (`/admin/storage`) or environment variables:

**Local Storage:**

```env
STORAGE_TYPE=local
STORAGE_PATH=./data/storage
```

**S3/MinIO/R2:**

```env
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
```

**Google Drive (via Admin Panel):**

- Navigate to `/admin/storage`
- Select "Google Drive"
- Enter Client ID, Secret, and Refresh Token
- Test connection before saving

### Security Configuration

**Rate Limiting:**

```env
RATE_LIMIT_AUTH=5          # Login attempts per 15 minutes
RATE_LIMIT_API=100         # API requests per minute
RATE_LIMIT_GIT=200         # Git operations per minute
RATE_LIMIT_SKIP_DEV=false  # Never skip in production
```

**CSRF Protection:**

```env
CSRF_SKIP_DEV=false  # Never skip in production
```

### Optional Services

**Email (SMTP):**

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@example.com
```

**Redis (Caching & Sessions):**

```env
REDIS_URL=redis://localhost:6379
```

**Error Monitoring (Sentry):**

```env
SENTRY_DSN=https://...
ENABLE_TRACING=true
```

---

## 🔒 Security

OpenCodeHub implements **production-grade security** out of the box:

### Implemented Security Features

✅ **Authentication & Authorization**

- JWT-based sessions with automatic expiration
- Bcrypt password hashing (10 rounds)
- 2FA/TOTP support
- Role-based access control (RBAC)

✅ **Attack Prevention**

- **Rate Limiting**: Prevents brute force (5 login attempts per 15min)
- **CSRF Protection**: Double-submit cookie pattern on all state-changing operations
- **Input Validation**: Zod schemas prevent SQL injection and XSS
- **XSS Sanitization**: Markdown rendered with `rehype-sanitize`

✅ **Operational Security**

- **Audit Logging**: All admin actions logged to database
- **Hook Authentication**: Git hooks protected with shared secrets
- **Session Management**: Automatic cleanup and rotation
- **Environment Validation**: Startup checks for missing/weak secrets

### Security Best Practices

1. **Always use HTTPS** in production (Let's Encrypt recommended)
2. **Rotate secrets** regularly (especially after team changes)
3. **Enable 2FA** for all admin accounts
4. **Monitor audit logs** for suspicious activity
5. **Keep dependencies updated**: Run `npm audit` weekly

### Reporting Security Issues

Please report security vulnerabilities to **security@opencodehub.io**. Do not create public issues.

---

## 🚀 Production Deployment

### Pre-Deployment Checklist

Before going live, ensure:

- [ ] **Secrets**: All secrets generated with `openssl rand -hex 32`
- [ ] **HTTPS**: SSL certificate configured (Let's Encrypt recommended)
- [ ] **Database**: PostgreSQL with backups enabled
- [ ] **Storage**: S3/R2 configured (not local filesystem)
- [ ] **Monitoring**: Error tracking (Sentry) and APM configured
- [ ] **Rate Limits**: Configured for expected traffic
- [ ] **Admin Account**: Created via `bun run scripts/seed-admin.ts`
- [ ] **Environment Validation**: Test with `bun run src/lib/env-validation.ts`
- [ ] **Database Migrations**: Generated with `npm run db:generate`

### Production Environment Variables

```env
# Application
NODE_ENV=production
SITE_URL=https://git.yourcompany.com
PORT=3000

# Security (CRITICAL - Generate with: openssl rand -hex 32)
JWT_SECRET=<64-char-random-hex>
SESSION_SECRET=<64-char-random-hex>
INTERNAL_HOOK_SECRET=<64-char-random-hex>

# Database (Use connection pooling)
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://user:password@db-host:5432/opencodehub?pool_timeout=30

# Storage (Use cloud storage)
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub-prod
STORAGE_REGION=us-east-1

# Rate Limiting (Adjust based on traffic)
RATE_LIMIT_AUTH=5
RATE_LIMIT_API=200
RATE_LIMIT_GIT=500

# Monitoring
SENTRY_DSN=https://your-sentry-dsn
LOG_LEVEL=info

# Features
ENABLE_REGISTRATION=true  # Set false for invite-only
```

### Docker Production Deployment

```yaml
# docker-compose.prod.yml
version: "3.8"

services:
  app:
    image: opencodehub:latest
    restart: always
    ports:
      - "3000:3000"
    env_file: .env.production
    depends_on:
      - postgres
      - redis
    volumes:
      - ./data:/app/data
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
      POSTGRES_PASSWORD: <strong-password>
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: always

volumes:
  postgres_data:
```

```bash
# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Monitor logs
docker-compose -f docker-compose.prod.yml logs -f app

# Health check
curl https://git.yourcompany.com/api/health
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name git.yourcompany.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Git operations (larger timeouts)
    location ~ ^/[^/]+/[^/]+\.git/ {
        proxy_pass http://localhost:3000;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
    }
}
```

### Database Backups

```bash
# PostgreSQL backup script (cron daily)
#!/bin/bash
pg_dump -U opencodehub opencodehub | gzip > /backups/opencodehub-$(date +\%Y\%m\%d).sql.gz

# Retain last 30 days
find /backups -name "opencodehub-*.sql.gz" -mtime +30 -delete
```

---

## 📚 API Documentation

### Authentication

All authenticated endpoints require a session cookie or `Authorization: Bearer <token>` header.

**Register:**

```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecureP@ssw0rd",
  "displayName": "John Doe"
}

# Response: 201 Created
{
  "user": { "id": "...", "username": "johndoe", ... },
  "token": "eyJ...",
  "expiresAt": "2026-01-08T00:00:00Z"
}
```

**Login:**

```bash
POST /api/auth/login
Content-Type: application/json

{
  "login": "john@example.com",  # username or email
  "password": "SecureP@ssw0rd"
}

# With 2FA:
{
  "login": "john@example.com",
  "password": "SecureP@ssw0rd",
  "totpCode": "123456"
}
```

### Repositories

**Create Repository:**

```bash
POST /api/repos
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "my-project",
  "description": "My awesome project",
  "visibility": "public"  # public, private, internal
}
```

**Branch Protection:**

```bash
POST /api/repos/{repoId}/branch-protection
Authorization: Bearer <token>
Content-Type: application/json

{
  "pattern": "main",
  "requiresPr": true,
  "requiredApprovals": 2,
  "dismissStaleReviews": true
}
```

### Admin Endpoints

**List Users (Admin Only):**

```bash
GET /admin/users?q=search&page=1
Cookie: och_session=...
```

**Update Storage Config (Admin Only):**

```bash
POST /api/admin/config/storage
Cookie: och_session=...
Content-Type: application/json

{
  "type": "s3",
  "bucket": "my-bucket",
  "region": "us-east-1",
  ...
}
```

### Rate Limits

All endpoints return rate limit headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2026-01-01T15:30:00Z
Retry-After: 30  (when rate limited)
```

**Full API documentation:** `/api/docs` (OpenAPI spec coming soon)

---

## 🔧 Usage Guide

### Creating Your First Repository

1. **Log in** to your account
2. Click the **+** button → **New Repository**
3. Fill in details:
   - **Name**: alphanumeric, hyphens, underscores
   - **Description**: Optional
   - **Visibility**: public/private
4. Click **Create Repository**

### Cl

oning Repositories

**SSH (Recommended):**

```bash
# Add your SSH key in Settings → SSH Keys
git clone git@your-domain.com:username/repo.git
```

**HTTPS:**

```bash
git clone https://your-domain.com/username/repo.git
# Username: your-username
# Password: your-password or personal access token
```

### Setting Up Branch Protection

1. Navigate to **Repository → Settings → Branches**
2. Click **Add Rule**
3. Configure:
   - **Pattern**: `main` or `release/*`
   - **Require PR**: ✅
   - **Required Approvals**: 2
   - **Dismiss Stale Reviews**: ✅
4. **Save Rule**

### CI/CD Workflows

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install
        run: npm ci

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

      - name: Upload Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist/
```

---

## 🐛 Troubleshooting

### Common Issues

**"Rate limit exceeded" on login:**

- Default: 5 attempts per 15 minutes
- Solution: Wait 15 minutes or adjust `RATE_LIMIT_AUTH` in `.env`

**"CSRF token validation failed":**

- Ensure cookies are enabled
- Check `SITE_URL` matches your actual domain
- Verify HTTPS in production

**"Unauthorized" on git hooks:**

- Check `INTERNAL_HOOK_SECRET` is set
- Verify hooks have correct secret in curl headers
- Re-run `git init` on repositories to reinstall hooks

**Database connection errors:**

- Verify `DATABASE_URL` format
- Check database server is running
- Ensure user has correct permissions

**Storage upload fails:**

- Test connection in `/admin/storage`
- Verify S3 credentials and bucket permissions
- Check firewall rules for external storage

### Debug Mode

```env
# Enable detailed logging
LOG_LEVEL=debug
NODE_ENV=development

# View logs
tail -f data/logs/opencodehub.log
```

### Health Check

```bash
curl http://localhost:3000/api/health

# Response:
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "storage": "ok",
    "redis": "ok" // if configured
  },
  "uptime": 123456,
  "version": "1.0.0"
}
```

---

## 🗺️ Roadmap

We are constantly improving OpenCodeHub to make it the ultimate self-hosted development platform.

### Q2 2026: Advanced AI Agents

- [ ] **Auto-Fix Agents**: Autonomous agents that can silently fix lint errors and simple bugs.
- [ ] **Test Generation**: Automatically generate unit and integration tests for new code.

### Q3 2026: Federation & Social

- [ ] **ActivityPub Support**: Follow users and repositories across different OpenCodeHub instances.
- [ ] **Federated Merge Requests**: Cross-instance collaboration (like Email but better).

### Q4 2026: Ecosystem Expansion

- [ ] **Mobile App**: Native iOS and Android apps for reviewing code on the go.
- [ ] **IDE Extensions**: dedicated VS Code and JetBrains plugins.

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Fork and clone
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpencodeHub

# Install dependencies
bun install

# Run in development
bun run dev

# Run tests
bun test

# Lint
bun run lint
```

### Submitting Changes

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Make your changes
3. Add tests
4. Run `bun test` and `bun run lint`
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [Astro](https://astro.build/) - Web framework
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Drizzle ORM](https://orm.drizzle.team/) - Database toolkit
- [simple-git](https://github.com/steveukx/git-js) - Git operations
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Zod](https://zod.dev/) - Schema validation

---

<p align="center">
  <strong>Made with ❤️ for the open source community</strong>
  <br>
  <a href="https://github.com/swadhinbiswas/OpencodeHub/issues">Report Bug</a> •
  <a href="https://github.com/swadhinbiswas/OpencodeHub/issues">Request Feature</a>
</p>
