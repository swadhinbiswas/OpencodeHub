# OpenCodeHub Worker on CircleCI Cloud (SaaS)

> **Platform:** CircleCI Cloud (managed SaaS) | **Database:** PostgreSQL | **Difficulty:** Easy-Medium

This guide is specifically for **CircleCI Cloud** (the managed service at circleci.com), NOT self-hosted runners. If you want to use self-hosted runners, see [CircleCI Self-Hosted Runner Guide](circleci-worker.md).

---

## How CircleCI Cloud Works for Workers

CircleCI Cloud runs jobs in **ephemeral Docker containers** that are destroyed after the job ends. This is fundamentally different from a traditional background worker:

| Feature | Traditional Worker | CircleCI Cloud |
|---------|-------------------|----------------|
| Lifetime | Runs forever | Max 5 hours per job |
| Storage | Persistent disk | Ephemeral (lost after job) |
| Database | Local or network | Must be external (network-accessible) |
| Redis | Local or network | Must be external |
| Cost | Server rental | Compute minutes |

**Bottom line:** CircleCI Cloud workers run in short bursts and connect to external services. This is actually perfect for OpenCodeHub's architecture because the worker code is stateless — all state lives in PostgreSQL + Redis.

---

## Prerequisites

Before you start, you need:

1. **CircleCI Account** (free tier works)
2. **External PostgreSQL** database (required — local DB won't persist)
3. **External Redis** (required — local Redis won't persist)
4. **Git repository** pushed to GitHub/GitLab/Bitbucket (CircleCI connects to it)

### Recommended PostgreSQL Providers

| Provider | Free Tier | Best For |
|----------|-----------|----------|
| **Supabase** | 500MB, 2GB egress | Full-featured, good dashboard |
| **Neon** | 500MB, 3 databases | Serverless, scales to zero |
| **Railway** | $5 credit | Simple, pay-as-you-go |
| **Render** | 1GB | Easy setup |
| **AWS RDS** | None | Enterprise |

### Recommended Redis Providers

| Provider | Free Tier | Best For |
|----------|-----------|----------|
| **Upstash** | 10,000 commands/day | Serverless, HTTP API |
| **Redis Cloud** | 30MB | Managed Redis |
| **Railway** | $5 credit | Easy setup |
| **KeyDB** | Self-host | Performance |

---

## Step 1: Set Up External PostgreSQL

### Using Supabase (Recommended)

1. Go to [supabase.com](https://supabase.com) and create a project
2. In **Project Settings** → **Database**, copy the connection string:
   ```
   postgresql://postgres:[password]@db.xxxxxxxxxx.supabase.co:5432/postgres
   ```
3. Create the `opencodehub` database:
   ```sql
   CREATE DATABASE opencodehub;
   ```

### Using Neon

1. Go to [neon.tech](https://neon.tech) and create a project
2. Copy the connection string from the dashboard
3. Create the database:
   ```sql
   CREATE DATABASE opencodehub;
   ```

---

## Step 2: Set Up External Redis

### Using Upstash (Recommended for Serverless)

1. Go to [upstash.com](https://upstash.com) and create a Redis database
2. Copy the **Redis URL**:
   ```
   rediss://default:[password]@xxxx.upstash.io:6379
   ```
3. Enable **TLS** (Upstash requires it)

---

## Step 3: Configure CircleCI Project

### 3.1 Connect Repository

1. Go to [app.circleci.com](https://app.circleci.com)
2. Click **Projects** → **Set Up Project**
3. Select your OpenCodeHub repository
4. CircleCI will detect `.circleci/config.yml`

### 3.2 Create a Context (Recommended)

Contexts let you share environment variables across jobs securely.

1. Go to **Organization Settings** → **Contexts**
2. Click **Create Context**
3. Name it: `opencodehub-production`
4. Add these environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `DATABASE_URL` | `postgresql://...` | Your PostgreSQL connection string |
| `DATABASE_DRIVER` | `postgres` | Explicitly set driver |
| `REDIS_URL` | `redis://...` or `rediss://...` | Your Redis URL |
| `JWT_SECRET` | `openssl rand -hex 32` | Generate this |
| `SESSION_SECRET` | `openssl rand -hex 32` | Generate this |
| `INTERNAL_HOOK_SECRET` | `openssl rand -hex 32` | Generate this |
| `CRON_SECRET` | `openssl rand -hex 32` | Generate this |
| `RUNNER_SECRET` | `openssl rand -hex 32` | Generate this |
| `WORKFLOW_SECRET_ENCRYPTION_KEY` | `openssl rand -hex 32` | Generate this |
| `SITE_URL` | `https://git.yourdomain.com` | Your OpenCodeHub URL |
| `SKIP_REDIS_CHECK` | `1` | Skip Redis check during build |

> **Security:** Never commit these values to git. Always use CircleCI contexts or project environment variables.

### 3.3 Alternative: Project-Level Environment Variables

If you don't want to use contexts:

1. Go to **Project Settings** → **Environment Variables**
2. Add each variable individually

---

## Step 4: Initialize Database Schema

Before the worker can run, the database schema must exist. Run this once:

```bash
# On your local machine with DATABASE_URL set
export DATABASE_URL="postgresql://postgres:[password]@db.xxxxxxxxxx.supabase.co:5432/opencodehub"

# Install dependencies
bun install

# Push schema to database
bun run db:push

# Or generate and run migrations
bun run db:generate
bun run db:migrate

# Create admin user
bun run scripts/seed-admin.ts
```

> **Important:** Do this from your local machine or a one-time job. The CircleCI worker job won't create the schema automatically.

---

## Step 5: Understanding the CircleCI Cloud Config

The `.circleci/config.yml` in your repo has multiple approaches:

### Option A: Scheduled Tasks (Recommended for Free Plan)

Jobs run on a cron schedule. Each job starts, does its work, and exits.

```yaml
workflows:
  scheduled-merge-queue:
    triggers:
      - schedule:
          cron: "*/15 * * * *"  # Every 15 minutes
    jobs:
      - merge-queue:
          context: opencodehub-production
```

**What happens:**
1. CircleCI starts a Docker container every 15 minutes
2. Installs Bun and dependencies
3. Runs `bun run scripts/worker.ts` for 30 minutes
4. Processes all pending merge queue items
5. Container is destroyed

**Pros:** Works on free plan, reliable, no timeouts
**Cons:** 15-minute delay between processing (jobs only run on schedule)

### Option B: Continuous Worker (Performance Plan)

One long-running job that stays active until timeout.

```yaml
workflows:
  worker-continuous:
    jobs:
      - worker:
          context: opencodehub-production
```

**What happens:**
1. CircleCI starts a container
2. Worker runs continuously, processing items every 5 seconds
3. Job runs until the 5-hour timeout
4. CircleCI restarts the job automatically

**Pros:** Near real-time processing
**Cons:** Requires Performance plan (5h jobs), uses more compute minutes

### Option C: API-Triggered (Event-Driven)

OpenCodeHub calls CircleCI API when events happen.

In your OpenCodeHub webhook handler:

```typescript
// When merge queue needs processing
async function triggerCircleCIWorker(eventType: string, repoId: string) {
  const response = await fetch(
    `https://circleci.com/api/v2/project/gh/${org}/${repo}/pipeline`,
    {
      method: "POST",
      headers: {
        "Circle-Token": process.env.CIRCLECI_API_TOKEN!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: "main",
        parameters: {
          event_type: eventType,
          repo_id: repoId,
        },
      }),
    }
  );
  return response.json();
}
```

**Pros:** Only runs when needed, most efficient
**Cons:** Requires code changes in OpenCodeHub, more complex setup

---

## Step 6: Choose Your Plan

### Free Plan (Recommended to Start)

```yaml
workflows:
  scheduled-merge-queue:
    triggers:
      - schedule:
          cron: "*/15 * * * *"  # Every 15 min
    jobs:
      - merge-queue:
          context: opencodehub-production
```

**Monthly usage:** ~2,880 minutes (48 runs/day × 30 days × 2 min avg)
**Free tier:** 6,000 minutes/month ✅

### Performance Plan (For Production)

```yaml
workflows:
  worker-continuous:
    jobs:
      - worker:
          context: opencodehub-production
```

**Monthly usage:** ~7,200 minutes (5h × 24/day × 30 days)
**Performance plan:** Included in price

---

## Step 7: Database Connection from CircleCI Cloud

Since CircleCI Cloud containers are ephemeral, the database must be network-accessible.

### Connection String Format

```bash
# Supabase
DATABASE_URL=postgresql://postgres:[password]@db.xxxxxxxxxx.supabase.co:5432/opencodehub

# Neon (with SSL)
DATABASE_URL=postgresql://[user]:[password]@ep-xxxxx.us-east-1.aws.neon.tech:5432/opencodehub?sslmode=require

# Railway
DATABASE_URL=postgresql://postgres:[password]@containers-xxxxx.railway.app:5432/railway

# AWS RDS (with SSL)
DATABASE_URL=postgresql://opencodehub:[password]@my-db.xxxxx.us-east-1.rds.amazonaws.com:5432/opencodehub?sslmode=require
```

### SSL/TLS Configuration

Most managed PostgreSQL require SSL. The worker handles this automatically when `sslmode=require` is in the URL.

For Supabase, add this to your environment variables:
```bash
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false  # Supabase uses self-signed certs
```

---

## Step 8: Redis Connection from CircleCI Cloud

### Upstash Redis URL

```bash
REDIS_URL=rediss://default:[password]@xxxx.upstash.io:6379
```

> Note: `rediss://` (with double s) = TLS enabled. Upstash requires TLS.

### Redis Cloud

```bash
REDIS_URL=redis://default:[password]@redis-xxxxx.redis-cloud.com:12345
```

### Testing Connection

You can test the connection from CircleCI by running the `health-check` job:

```bash
# Trigger manually from CircleCI dashboard
# or wait for the scheduled health check
```

---

## Step 9: Monitoring

### View Job Logs

1. Go to [app.circleci.com](https://app.circleci.com)
2. Select your project
3. Click on any job to see real-time logs

### Set Up Notifications

1. **Project Settings** → **Notifications**
2. Connect Slack, email, or webhooks
3. Get alerts when jobs fail

### Track Compute Usage

1. **Plan** → **Usage**
2. Monitor minutes used per month
3. Set up usage alerts

---

## Step 10: Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Database connection refused"** | Your PostgreSQL doesn't allow external connections. Check provider's "Connection Pooling" or "Network" settings. For Supabase, go to Database → Connection Pooling. |
| **"Redis connection timeout"** | Redis provider blocks unknown IPs. Add CircleCI's IP ranges to allowlist. Or use Upstash which doesn't require IP allowlisting. |
| **Job killed after 1 hour** | Free plan default timeout is 1 hour. Add `no_output_timeout: 5h` or upgrade to Performance plan. |
| **"Out of memory"** | Use `resource_class: large` instead of `medium`. Or optimize the worker memory usage. |
| **"bun install fails"** | Network issues. The config has retry logic, but you can also try `npm install` as fallback. |
| **"Schema doesn't exist"** | Run `bun run db:push` from your local machine first to create tables. |
| **Worker starts but does nothing** | Check that `DATABASE_URL` points to the right database and that the `mergeQueueItems` table has rows with `status = 'queued'`. |
| **"SSL certificate verify failed"** | Add `DATABASE_SSL_REJECT_UNAUTHORIZED=false` for providers with self-signed certs (Supabase). |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    CircleCI Cloud                           │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Docker Container │  │ Docker Container │  ...            │
│  │ (every 15 min)   │  │ (every 15 min)   │                  │
│  │                  │  │                  │                  │
│  │ bun run worker.ts│  │ bun run worker.ts│                  │
│  │                  │  │                  │                  │
│  │ ┌─────────────┐  │  │ ┌─────────────┐  │                  │
│  │ │ Node.js/Bun │  │  │ │ Node.js/Bun │  │                  │
│  │ │ Worker Loop │  │  │ │ Worker Loop │  │                  │
│  │ └─────────────┘  │  │ └─────────────┘  │                  │
│  └────────┬─────────┘  └────────┬─────────┘                  │
└───────────┼─────────────────────┼────────────────────────────┘
            │                     │
            │  TCP/IP (Internet)  │
            ▼                     ▼
    ┌──────────────┐      ┌──────────────┐
    │  PostgreSQL   │      │    Redis     │
    │  (Supabase)   │      │  (Upstash)   │
    │               │      │              │
    │ merge_queue   │      │ sessions     │
    │ repositories  │      │ rate limits  │
    │ pull_requests │      │ job queues   │
    └──────────────┘      └──────────────┘
```

---

## Quick Start Checklist

- [ ] Create PostgreSQL database (Supabase/Neon/Railway)
- [ ] Create Redis database (Upstash/Redis Cloud)
- [ ] Run `bun run db:push` from local machine
- [ ] Push OpenCodeHub code to GitHub
- [ ] Connect repo to CircleCI
- [ ] Create Context `opencodehub-production` with all env vars
- [ ] Verify `.circleci/config.yml` is in repo root
- [ ] Trigger first job manually from CircleCI dashboard
- [ ] Check job logs for "✅ Worker started"
- [ ] Create a test PR and verify merge queue processes it

---

## Next Steps

- [CircleCI Integration Guide](/guides/circleci-integration/) — For CI/CD pipelines (separate from worker)
- [Deployment Guide](/administration/deployment/) — Full production setup
- [Self-Hosted Runner Guide](circleci-worker.md) — If you prefer self-hosted over Cloud
- [Merge Queue](/features/merge-queue/) — How merge queue works
