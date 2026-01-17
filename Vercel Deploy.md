# Deploy OpenCodeHub to Vercel

> Complete guide to deploying OpenCodeHub on Vercel with Turso, Google Drive, and Redis

This guide walks you through deploying OpenCodeHub to Vercel using:
- **Turso** - Serverless SQLite database (edge-compatible)
- **Google Drive API** - File storage for repositories
- **Upstash Redis** - Serverless Redis for sessions and caching

**Estimated time:** 30-45 minutes  
**Cost:** Free tier available for all services

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup Turso Database](#setup-turso-database)
3. [Setup Google Drive Storage](#setup-google-drive-storage)
4. [Setup Upstash Redis](#setup-upstash-redis)
5. [Configure Project](#configure-project)
6. [Deploy to Vercel](#deploy-to-vercel)
7. [Post-Deployment](#post-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- [x] GitHub account
- [x] Vercel account ([vercel.com](https://vercel.com))
- [x] Turso account ([turso.tech](https://turso.tech))
- [x] Google Cloud account ([console.cloud.google.com](https://console.cloud.google.com))
- [x] Upstash account ([upstash.com](https://upstash.com))
- [x] OpenCodeHub repository forked/cloned

---

## 1. Setup Turso Database

Turso provides edge-compatible, serverless SQLite databases perfect for Vercel.

### 1.1. Install Turso CLI

```bash
# macOS/Linux
curl -sSfL https://get.tur.so/install.sh | bash

# Windows (PowerShell)
irm get.tur.so/install.ps1 | iex

# Verify installation
turso --version
```

### 1.2. Login to Turso

```bash
turso auth login
```

This opens your browser to authenticate.

### 1.3. Create Database

```bash
# Create database
turso db create opencodehub

# Create auth token
turso db tokens create opencodehub

# Get database URL
turso db show opencodehub --url
```

**Save these values:**
```env
TURSO_DATABASE_URL=libsql://opencodehub-[your-org].turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJ...
```

### 1.4. Initialize Database Schema

```bash
# Download schema
curl -O https://raw.githubusercontent.com/swadhinbiswas/OpencodeHub/main/drizzle/schema.sql

# Apply schema
turso db shell opencodehub < schema.sql

# Verify tables
turso db shell opencodehub "SELECT name FROM sqlite_master WHERE type='table';"
```

**Expected output:**
```
users
repositories
pull_requests
pr_stacks
merge_queue_items
ai_reviews
...
```

---

## 2. Setup Google Drive Storage

Google Drive API will store Git repositories and LFS files.

### 2.1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click **Select a project** → **New Project**
3. Name: `opencodehub-storage`
4. Click **Create**

### 2.2. Enable Google Drive API

1. In the Cloud Console, go to **APIs & Services** → **Enable APIs**
2. Search for "Google Drive API"
3. Click **Enable**

### 2.3. Create Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Name: `opencodehub-storage-sa`
4. Click **Create and Continue**
5. Grant role: **Editor**
6. Click **Done**

### 2.4. Generate Service Account Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON**
5. Click **Create** (downloads `opencodehub-storage-xxxxx.json`)

### 2.5. Create Google Drive Folder

1. Go to [Google Drive](https://drive.google.com)
2. Create a new folder: `OpenCodeHub-Repositories`
3. Right-click → **Share**
4. Add the service account email: `opencodehub-storage-sa@opencodehub-storage.iam.gserviceaccount.com`
5. Grant **Editor** access
6. Copy the **Folder ID** from the URL:
   ```
   https://drive.google.com/drive/folders/1a2B3c4D5e6F7g8H9i0J
                                          ^^^^^^^^^^^^^^^^^^^^
                                          This is your folder ID
   ```

### 2.6. Prepare Service Account Credentials

Open the downloaded JSON file and extract these values:

```json
{
  "type": "service_account",
  "project_id": "opencodehub-storage",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "opencodehub-storage-sa@...",
  "client_id": "123456789...",
  ...
}
```

**Save for later:**
```env
GOOGLE_DRIVE_FOLDER_ID=1a2B3c4D5e6F7g8H9i0J
GOOGLE_SERVICE_ACCOUNT_EMAIL=opencodehub-storage-sa@opencodehub-storage.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
GOOGLE_CLIENT_ID=123456789...
```

---

## 3. Setup Upstash Redis

Upstash provides serverless Redis, perfect for Vercel edge functions.

### 3.1. Create Redis Database

1. Go to [Upstash Console](https://console.upstash.com)
2. Click **Create Database**
3. **Name:** `opencodehub-sessions`
4. **Region:** Choose closest to your users (e.g., `us-east-1`)
5. **Type:** Regional (free tier)
6. Click **Create**

### 3.2. Get Connection Details

After creation, copy these values:

**REST API:**
```env
UPSTASH_REDIS_REST_URL=https://us1-prepared-moose-12345.upstash.io
UPSTASH_REDIS_REST_TOKEN=AaBbCc...==
```

**Redis URL (optional):**
```env
REDIS_URL=redis://default:password@region.upstash.io:port
```

### 3.3. Configure Redis for Sessions

Upstash Redis will handle:
- User sessions
- Rate limiting
- Temporary locks
- Cache

No additional setup needed!

---

## 4. Configure Project

### 4.1. Update Database Configuration

Create/update `src/db/turso.ts`:

```typescript
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export const db = drizzle(turso);
```

### 4.2. Update Storage Configuration

Create/update `src/lib/storage/google-drive.ts`:

```typescript
import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

export async function uploadFile(fileName: string, content: Buffer) {
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId!],
    },
    media: {
      body: content,
    },
  });
  
  return response.data.id;
}

export async function downloadFile(fileId: string) {
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  
  return Buffer.from(response.data as ArrayBuffer);
}

export async function deleteFile(fileId: string) {
  await drive.files.delete({ fileId });
}
```

### 4.3. Update Redis Configuration

Create/update `src/lib/redis.ts`:

```typescript
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Session management
export async function setSession(sessionId: string, data: any, ttl = 7 * 24 * 60 * 60) {
  await redis.setex(sessionId, ttl, JSON.stringify(data));
}

export async function getSession(sessionId: string) {
  const data = await redis.get(sessionId);
  return data ? JSON.parse(data as string) : null;
}

export async function deleteSession(sessionId: string) {
  await redis.del(sessionId);
}
```

### 4.4. Install Dependencies

```bash
# Add Turso client
bun add @libsql/client drizzle-orm

# Add Google Drive API
bun add googleapis

# Add Upstash Redis
bun add @upstash/redis
```

### 4.5. Update Environment Variables Template

Create `.env.example`:

```env
# === Turso Database ===
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token

# === Google Drive Storage ===
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_ID=your-client-id

# === Upstash Redis ===
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# === Application ===
SITE_URL=https://your-app.vercel.app
JWT_SECRET=generate-a-strong-secret
SESSION_SECRET=generate-another-strong-secret
INTERNAL_HOOK_SECRET=generate-hook-secret

# === Optional: AI Review ===
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

### 4.6. Generate Secrets

```bash
# Generate secrets
openssl rand -base64 32  # JWT_SECRET
openssl rand -base64 32  # SESSION_SECRET
openssl rand -base64 32  # INTERNAL_HOOK_SECRET
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
3. Import your GitHub repository
4. Select `OpencodeHub`

**Option B: Via CLI**

```bash
cd opencodehub
vercel
```

### 5.3. Configure Environment Variables

In Vercel Dashboard:

1. Go to **Project Settings** → **Environment Variables**
2. Add all variables from step 4.5:

**Turso:**
- `TURSO_DATABASE_URL` = `libsql://opencodehub-xxxx.turso.io`
- `TURSO_AUTH_TOKEN` = `eyJhbG...`

**Google Drive:**
- `GOOGLE_DRIVE_FOLDER_ID` = `1a2B3c4D5e6F7g8H9i0J`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `opencodehub-storage-sa@...`
- `GOOGLE_PRIVATE_KEY` = Paste entire private key (including `\n`)
- `GOOGLE_CLIENT_ID` = `123456789...`

**Upstash Redis:**
- `UPSTASH_REDIS_REST_URL` = `https://...upstash.io`
- `UPSTASH_REDIS_REST_TOKEN` = `AaBbCc...`

**Application:**
- `SITE_URL` = `https://your-project.vercel.app` (update later)
- `JWT_SECRET` = Generated secret
- `SESSION_SECRET` = Generated secret
- `INTERNAL_HOOK_SECRET` = Generated secret

**AI (Optional):**
- `AI_PROVIDER` = `openai`
- `OPENAI_API_KEY` = `sk-...`

### 5.4. Configure Build Settings

In **Project Settings** → **Build & Development Settings**:

- **Framework Preset:** Astro
- **Build Command:** `bun run build`
- **Output Directory:** `dist`
- **Install Command:** `bun install`

### 5.5. Deploy!

Click **Deploy** or run:

```bash
vercel --prod
```

**Deployment will:**
1. Install dependencies
2. Build the project
3. Deploy to Vercel Edge Network
4. Provide deployment URL

---

## 6. Post-Deployment

### 6.1. Update SITE_URL

1. Copy your Vercel deployment URL: `https://opencodehub-abc123.vercel.app`
2. Update environment variable:
   - Go to **Settings** → **Environment Variables**
   - Edit `SITE_URL` = your actual URL
3. **Redeploy** (Vercel Dashboard → Deployments → Redeploy)

### 6.2. Create Admin User

**Option A: Via Turso CLI**

```bash
turso db shell opencodehub

-- In the Turso shell:
INSERT INTO users (id, email, password_hash, username, role, created_at)
VALUES (
  'admin-user-id',
  'admin@yourcompany.com',
  '$2b$10$...',  -- bcrypt hash of your password
  'admin',
  'admin',
  current_timestamp
);
```

**Generate bcrypt hash:**
```javascript
// Run in Node.js
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash('your-password', 10);
console.log(hash);
```

**Option B: Via Deployment Script**

Create `scripts/create-admin-vercel.ts`:

```typescript
import { db } from '../src/db/turso';
import { users } from '../src/db/schema';
import bcrypt from 'bcrypt';

const email = process.env.ADMIN_EMAIL || 'admin@example.com';
const password = process.env.ADMIN_PASSWORD || 'changeme';

const hash = await bcrypt.hash(password, 10);

await db.insert(users).values({
  id: crypto.randomUUID(),
  email,
  username: 'admin',
  password_hash: hash,
  role: 'admin',
  createdAt: new Date(),
});

console.log(`✅ Admin user created: ${email}`);
```

Run once:
```bash
ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=strong123 bun scripts/create-admin-vercel.ts
```

### 6.3. Configure Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your custom domain: `git.yourcompany.com`
3. Follow DNS configuration instructions
4. Update `SITE_URL` to your custom domain

### 6.4. Setup Monitoring

**Vercel Analytics:**
1. Go to **Analytics** tab
2. Enable **Web Analytics**
3. Enable **Speed Insights**

**Sentry (Optional):**
```bash
bun add @sentry/astro
```

Add to `.env`:
```env
SENTRY_DSN=https://...@sentry.io/...
```

---

## 7. Verification

### 7.1. Test Database Connection

Visit: `https://your-app.vercel.app/api/health`

Should return:
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "storage": "configured"
}
```

### 7.2. Test Storage

1. Login as admin
2. Create a repository
3. Push a commit
4. Verify file appears in Google Drive folder

### 7.3. Test Redis

1. Login
2. Check session persists
3. Logout
4. Session cleared

### 7.4. Load Test

```bash
# Install hey
go install github.com/rakyll/hey@latest

# Test
hey -n 1000 -c 10 https://your-app.vercel.app
```

Expected: >90% success rate

---

## 8. Troubleshooting

### Database Connection Fails

**Error:** `Failed to connect to Turso`

**Solution:**
```bash
# Verify token is valid
turso db tokens validate opencodehub YOUR_TOKEN

# Regenerate if needed
turso db tokens create opencodehub
```

Update environment variable and redeploy.

### Google Drive Upload Fails

**Error:** `Insufficient permissions`

**Solution:**
1. Verify service account has Editor access to folder
2. Check private key doesn't have extra spaces/newlines
3. Test locally:
   ```bash
   bun test src/lib/storage/google-drive.test.ts
   ```

### Redis Connection Timeout

**Error:** `ETIMEDOUT connecting to Redis`

**Solution:**
1. Verify Upstash Redis region matches Vercel deployment region
2. Check REST URL and token are correct
3. Test connection:
   ```bash
   curl https://YOUR_REDIS_URL/get/test \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

### Build Fails on Vercel

**Error:** `Command "build" exited with 1`

**Solution:**
```bash
# Test build locally
bun run build

# Check for TypeScript errors
bun run typecheck

# Check environment variables are set
vercel env ls
```

### Out of Memory

**Error:** `JavaScript heap out of memory`

** Solution:**
Upgrade Vercel plan or optimize build:

```json
// package.json
{
  "scripts": {
    "build": "NODE_OPTIONS=--max_old_space_size=4096 astro build"
  }
}
```

---

## Cost Estimation

### Free Tier Limits

**Turso:**
- Database: Free up to 8 GB
- Rows: 500M
- Locations: 1 primary + 2 replicas

**Upstash Redis:**
- Commands: 10,000/day
- Storage: 256 MB
- Bandwidth: 256 MB/month

**Google Drive:**
- Storage: 15 GB free
- API calls: Unlimited

**Vercel:**
- Bandwidth: 100 GB/month
- Deployments: Unlimited
- Edge Functions: 100 GB-hrs

### Estimated Monthly Cost

**Low traffic (< 1,000 users):**
- All free tier ✅

**Medium traffic (1,000-10,000 users):**
- Turso: $0 (within limits)
- Upstash: $10/month (higher tier)
- Google Drive: $2/month (Google One 100GB)
- Vercel: $20/month (Pro plan)
**Total: ~$32/month**

**High traffic (>10,000 users):**
- Turso: $29/month (Pro)
- Upstash: $50/month (Pro)
- Google Drive: $10/month (Google Workspace)
- Vercel: $20/month (Pro)
**Total: ~$109/month**

---

## Performance Optimization

### Edge Caching

Add to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

### Database Connection Pooling

Turso handles this automatically with libSQL.

### Redis Caching Strategy

```typescript
// Cache expensive queries
async function getRepository(id: string) {
  const cached = await redis.get(`repo:${id}`);
  if (cached) return JSON.parse(cached as string);
  
  const repo = await db.query.repositories.findFirst({ where: eq(repositories.id, id) });
  await redis.setex(`repo:${id}`, 300, JSON.stringify(repo)); // Cache 5 min
  
  return repo;
}
```

---

## Security Checklist

- [ ] All secrets in environment variables (not committed to Git)
- [ ] HTTPS enabled (automatic on Vercel)
- [ ] Database access restricted to Vercel IPs
- [ ] Google Drive folder shared only with service account
- [ ] Redis requires authentication
- [ ] Rate limiting enabled
- [ ] CORS configured properly
- [ ] CSP headers set

---

## Next Steps

1. **Setup CI/CD**: Automatic deployments on push to main
2. **Add Monitoring**: Set up Sentry for error tracking
3. **Configure Backups**: Turso auto-backups + manual exports
4. **Scale Redis**: Upgrade to Global for multi-region
5. **Add CDN**: Use Vercel Edge Network or Cloudflare

---

## Additional Resources

- [Turso Documentation](https://docs.turso.tech)
- [Google Drive API Reference](https://developers.google.com/drive/api/v3/reference)
- [Upstash Redis Docs](https://docs.upstash.com/redis)
- [Vercel Deployment Docs](https://vercel.com/docs)
- [OpenCodeHub GitHub](https://github.com/swadhinbiswas/OpencodeHub)

---

## Support

**Need help?**
- 💬 [Discord Community](https://discord.gg/opencodehub)
- 🐛 [GitHub Issues](https://github.com/swadhinbiswas/OpencodeHub/issues)
- 📧 [Email Support](mailto:support@opencodehub.com)

---

**Congratulations!** 🎉 Your OpenCodeHub instance is now running on Vercel with world-class serverless infrastructure!
