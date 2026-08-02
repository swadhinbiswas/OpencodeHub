# Deploy OpenCodeHub to Vercel (Edge)

> Complete guide to deploying OpenCodeHub on Vercel with Turso (LibSQL),
> S3-compatible storage, and Upstash Redis.

OpenCodeHub is configured entirely through environment variables, so an
edge/Serverless deployment is just a matter of pointing the built-in
database, storage, and Redis drivers at managed services. The codebase
handles all three driver families — no custom code is needed.

- **Turso (LibSQL)** — edge-compatible SQLite database
- **S3-compatible storage** — Cloudflare R2 (free egress, recommended),
  MinIO, AWS S3, Garage, etc.
- **Upstash Redis** — serverless Redis for sessions, rate limiting, queues

> **Storage note:** only `local` and `s3` backends are supported.
> Google Drive, OneDrive, Dropbox, GCS, Azure, and FTP backends were
> removed. For Serverless, always use an S3-compatible store (`STORAGE_TYPE=s3`).

**Estimated time:** 30-45 minutes
**Cost:** Free tier available for all services

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup Turso Database](#setup-turso-database)
3. [Setup S3-compatible Storage (R2)](#setup-s3-compatible-storage)
4. [Setup Upstash Redis](#setup-upstash-redis)
5. [Configure Project](#configure-project)
6. [Deploy to Vercel](#deploy-to-vercel)
7. [Post-Deployment](#post-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- [ ] GitHub account
- [ ] Vercel account ([vercel.com](https://vercel.com))
- [ ] Turso account ([turso.tech](https://turso.tech))
- [ ] Cloudflare account for R2 ([cloudflare.com](https://dash.cloudflare.com)) — or any S3-compatible store
- [ ] Upstash account ([upstash.com](https://upstash.com))
- [ ] OpenCodeHub repository forked/cloned

---

## 1. Setup Turso Database

Turso provides edge-compatible, serverless SQLite databases.

### 1.1. Install Turso CLI

```bash
# macOS/Linux
curl -sSfL https://get.tur.so/install.sh | bash
```

### 1.2. Login to Turso

```bash
turso auth login
```

### 1.3. Create Database

```bash
# Create database
turso db create opencodehub

# Create auth token
turso db tokens create opencodehub

# Get database URL
turso db show opencodehub
```

Save the **database URL** (starts with `libsql://`) and the **auth token** —
you will need them for Vercel.

### 1.4. Initialize Database Schema

The app applies schema migrations at startup via `scripts/migrate.ts`
using the committed `drizzle/` migrations:

```bash
DATABASE_DRIVER=turso DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... bun run migrate
```

On Vercel, run this once from your machine against the Turso database
before the first deploy (Serverless functions have a short lifespan and
should not run migrations per-request).

---

## 2. Setup S3-compatible Storage

Use an S3-compatible object store for git objects, LFS, and artifacts.
Cloudflare R2 is recommended for Serverless because egress is free.

### 2.1. Create an R2 Bucket

1. Cloudflare Dashboard → **R2** → **Create bucket** → name it `opencodehub`
2. Go to **R2 → Manage R2 API Tokens** → **Create API Token**
   - Permissions: **Object Read & Write** on the bucket
3. Save the **Access Key ID** and **Secret Access Key**

Your endpoint is:
`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
(found in **R2 → Overview → Account ID**).

> Any S3-compatible provider works: AWS S3 (`STORAGE_ENDPOINT` empty),
> MinIO (`http://minio:9000`), Garage, SeaweedFS, Ceph RGW, Wasabi, B2.

---

## 3. Setup Upstash Redis

Upstash provides serverless Redis with a REST API — ideal for Vercel.

### 3.1. Create Redis Database

1. Go to [Upstash Console](https://console.upstash.com)
2. Click **Create Database** → name it `opencodehub`
3. Region: **Global** (or closest to your Vercel region)

### 3.2. Get Connection Details

In the database details page:

- **REST URL** — e.g. `https://your-redis.upstash.io`
- **REST Token** — long alphanumeric token

Save both.

---

## 4. Configure Project

No code changes are required — everything is configured via environment
variables that the built-in factory reads:

- Database: `src/db/index.ts` (reads `DATABASE_DRIVER` + `DATABASE_URL`)
- Storage: `src/lib/storage.ts` (reads `STORAGE_TYPE` + `STORAGE_*`)
- Redis: reads `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
  (or `REDIS_URL`)

### 4.1. Environment Variables Template

```env
# === Database (Turso) ===
DATABASE_DRIVER=turso
DATABASE_URL=libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=your-token

# === Storage (S3-compatible — R2 shown) ===
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=your-access-key-id
STORAGE_SECRET_ACCESS_KEY=your-secret-access-key

# === Redis (Upstash) ===
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# === Application ===
SITE_URL=https://your-app.vercel.app
NODE_ENV=production
JWT_SECRET=generate-a-strong-secret
SESSION_SECRET=generate-another-strong-secret
INTERNAL_HOOK_SECRET=generate-hook-secret
CRON_SECRET=generate-cron-secret
RUNNER_SECRET=generate-runner-secret
AI_CONFIG_ENCRYPTION_KEY=generate-encryption-key
WORKFLOW_SECRET_ENCRYPTION_KEY=generate-encryption-key
METRICS_TOKEN=generate-metrics-token

# === Optional: AI Review ===
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

### 4.2. Generate Secrets

```bash
openssl rand -base64 32  # each secret
```

---

## 5. Deploy to Vercel

### 5.1. Install Vercel CLI (Optional)

```bash
bun install -g vercel
vercel login
```

### 5.2. Connect Repository to Vercel

**Option A: Via Vercel Dashboard**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. Import your OpenCodeHub repository

**Option B: Via CLI**

```bash
vercel --prod
```

### 5.3. Configure Environment Variables

In **Vercel → Project → Settings → Environment Variables**, add every
variable from section 4.1.

### 5.4. Configure Build Settings

Use the defaults (Vercel auto-detects Astro):

- **Build Command:** `npm run build`
- **Output Directory:** `dist/`
- **Framework:** Astro

> The repo ships `@astrojs/vercel` and a `vercel.json`. For edge use,
> switch the adapter in `astro.config.mjs` from `@astrojs/node` to
> `@astrojs/vercel` with `output: "server"` (Turso + Upstash are both
> edge-compatible).

### 5.5. Deploy!

```bash
vercel --prod
```

---

## 6. Post-Deployment

### 6.1. Update SITE_URL

Set `SITE_URL` to your final domain, e.g. `https://git.yourdomain.com`.

### 6.2. Create Admin User

```bash
# From your machine, once, against the same Turso database:
DATABASE_DRIVER=turso DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... bun run scripts/seed-admin.ts
```

### 6.3. Configure Custom Domain (Optional)

In Vercel → Project → **Settings → Domains**, add your domain.

### 6.4. Setup Monitoring

- Prometheus: scrape `GET /api/metrics` with `Authorization: Bearer $METRICS_TOKEN`
- Use Vercel's built-in analytics + logs for request/error tracking

---

## 7. Verification

### 7.1. Test Database Connection

```bash
turso db shell opencodehub
# Run: SELECT count(*) FROM users;
```

### 7.2. Test Storage

1. Create a repository with a large file (LFS)
2. Push — verify the object appears in the R2 bucket

### 7.3. Test Redis

Push a git update and confirm webhooks/queues process (Redis-backed).

### 7.4. Load Test

```bash
# Install hey
brew install hey   # or: go install github.com/rakyll/hey@latest

# Test
hey -n 1000 -c 50 https://your-app.vercel.app/api/health
```

---

## 8. Troubleshooting

### Database Connection Fails

- Verify `DATABASE_DRIVER=turso` and the `libsql://` URL + token are correct
- Run `bun run migrate` locally against the same DB (see section 1.4)

### Storage Upload Fails

- Verify bucket name, endpoint, and access key (S3 v4 signature)
- R2: token must have **Object Read & Write** scope on the bucket

### Redis Connection Timeout

- Confirm the Upstash REST URL/token are set (not `REDIS_URL`)

### Build Fails on Vercel

```bash
# Test build locally
npm run build

# Check for TypeScript errors
npm run typecheck

# Check environment variables are set
bun run src/lib/env-validation.ts
```

---

## Limitations vs. Self-Hosted

- **No CI/CD runner** — pipeline execution requires a Docker host; on Vercel
  use a self-hosted runner (see `packages/ci-runner` / `Dockerfile.runner`)
- **No SSH Git** — SSH git requires a long-lived process
  (`scripts/ssh-server.ts`); use HTTP git with PATs on Serverless
- **Background worker** — scheduled jobs (`scripts/worker.ts`) need a
  long-running host; run it in a small container next to your DB
