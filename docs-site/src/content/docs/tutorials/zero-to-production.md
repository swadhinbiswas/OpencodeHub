---
title: "From Zero to Production"
description: "End‑to‑end setup from local dev to a production‑ready instance."
---

This tutorial walks from a clean clone to a production‑ready deployment.

## 1) Local setup

```bash
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub
npm install
cp .env.example .env
```

Update the required secrets in `.env` (`JWT_SECRET`, `SESSION_SECRET`, `INTERNAL_HOOK_SECRET`, `SITE_URL`).

## 2) Database migrations

```bash
npm run db:push
```

## 3) Create admin user

```bash
bun run scripts/seed-admin.ts
```

## 4) Start the server

```bash
npm run dev
```

Open the app at `http://localhost:3000` and log in.

## 5) Production deployment

For production, use Docker:

```bash
docker-compose up -d
```

Then seed the admin user inside the container:

```bash
docker-compose exec app bun run scripts/seed-admin.ts
```

## Next steps

- [administration/deployment](../administration/deployment)
- [administration/configuration](../administration/configuration)
- [administration/deploy-docker](../administration/deploy-docker)
