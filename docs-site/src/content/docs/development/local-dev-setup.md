---
title: "Local Development Setup"
description: "Set up a productive local dev environment for OpenCodeHub."
---

## Prerequisites

- Node.js 18+ (project `engines` specify Node 20+ for runtime)
- Git 2.30+
- PostgreSQL/MySQL/SQLite (PostgreSQL recommended)

## Install dependencies

```bash
npm install
```

## Environment

```bash
cp .env.example .env
```

Set required values like `JWT_SECRET`, `SESSION_SECRET`, `INTERNAL_HOOK_SECRET`, and `SITE_URL`.

## Database

```bash
npm run db:push
```

## Seed admin user

```bash
bun run scripts/seed-admin.ts
```

## Run dev server

```bash
npm run dev
```

Open the app at `http://localhost:3000`.

## Useful scripts

- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:studio`
- `npm run lint`
- `npm run test`
