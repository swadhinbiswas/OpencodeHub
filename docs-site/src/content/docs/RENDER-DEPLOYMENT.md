---
title: "Render Deployment Guide"
---

# OpenCodeHub — Render Deployment Guide

> Deploy to Render (Singapore) with free PostgreSQL + Upstash Redis. $0/month.

---

## What You Get

- OpenCodeHub running in Asia (Singapore)
- Free PostgreSQL database
- Free Redis via Upstash
- 1GB persistent storage for git repos
- HTTPS included
- Admin account

---

## Step 1: Create Upstash Redis (2 min)

1. Go to **https://upstash.com** → Sign up (free)
2. Click **Create Database**
3. Settings:
   - **Name**: `opencodehub`
   - **Region**: **Asia Pacific (Singapore)**
   - **Plan**: Pay as you go (free tier: 10K commands/day)
4. Click **Create**
5. Copy the **Redis URL** (looks like `rediss://...@...`)
6. Keep this tab open — you'll need it in Step 3

---

## Step 2: Deploy to Render (5 min)

1. Go to **https://render.com** → Sign up (free)
2. Click **New** → **Blueprint**
3. Connect your GitHub account
4. Select your OpenCodeHub repository
5. Render detects `render.yaml` and shows:
   - `opencodehub-db` (PostgreSQL — Singapore)
   - `opencodehub` (Web Service — Singapore)
6. Click **Apply**
7. Wait for deployment (~3-5 min first time)

---

## Step 3: Set Redis URL (1 min)

1. Go to your Web Service → **Environment** tab
2. Find `REDIS_URL` (shows "Not set")
3. Click the pencil icon → Paste your **Upstash Redis URL**
4. Click **Save**

---

## Step 4: Set Site URL (1 min)

1. In the same **Environment** tab
2. Find `SITE_URL` (shows "Not set")
3. Click the pencil icon → Enter your Render URL:
   ```
   https://opencodehub.onrender.com
   ```
   (Replace with your actual URL from the service overview)
4. Click **Save**

---

## Step 5: Manual Deploy

1. Go to your Web Service → **Manual Deploy**
2. Click **Deploy latest commit**
3. Wait for build to complete (~2-3 min)
4. Click the **URL** at the top to open your instance

---

## Step 6: Create Admin Account

You'll see the **Setup Wizard**. Fill in:

| Field | Value |
|-------|-------|
| Username | `admin` (or your choice) |
| Email | Your email |
| Password | Strong password |

Click **Create Account** — you're now logged in as admin!

---

## Step 7: Test It

```bash
# Create a repo via web UI, then clone:
git clone https://opencodehub.onrender.com/your-username/my-repo.git

# Push code:
cd my-repo
echo "# Hello" > README.md
git add . && git commit -m "Initial"
git push origin main
```

---

## Done! Summary

| Component | Service | Region | Cost |
|-----------|---------|--------|------|
| App | Render Free | Singapore | $0 |
| PostgreSQL | Render Free | Singapore | $0 |
| Redis | Upstash Free | Singapore | $0 |
| Storage | Render Disk 1GB | Singapore | $0 |
| **Total** | | | **$0/month** |

---

## Keep Alive (Optional)

Render free tier spins down after 15min inactivity. To prevent:

1. Go to **https://uptimerobot.com** → Sign up (free)
2. Add Monitor → Type: HTTP(s)
3. URL: `https://opencodehub.onrender.com/api/health`
4. Monitoring interval: 5 minutes
5. Save — your app stays awake

---

## Upgrade Path (When You Grow)

| Need | Upgrade | Cost |
|------|---------|------|
| Always-on (no spin-down) | Render Starter | $7/mo |
| More storage (10GB+) | Render Disk upgrade | $1-7/mo |
| More Redis commands | Upstash Pay-as-you-go | ~$0.20/10K |
| PostgreSQL expiry | Render Starter DB | $7/mo |

---

## Troubleshooting

**App won't start?**
- Check **Logs** tab in Render
- Verify `REDIS_URL` is set correctly
- Ensure `SITE_URL` matches your Render URL

**Redis connection failed?**
- Verify Redis URL from Upstash (starts with `rediss://`)
- Check Upstash dashboard shows "Active"
- Ensure region is Singapore

**Git clone fails?**
- Use HTTPS: `git clone https://your-url.onrender.com/user/repo.git`
- SSH not available on Render free tier (use HTTPS)

**Slow first request?**
- Normal for free tier (cold start ~30s)
- Add UptimeRobot ping to keep it warm

---

*OpenCodeHub — Deployed on Render, Asia Region, $0/month.*
