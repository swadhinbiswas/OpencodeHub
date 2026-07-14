---
title: "Local Development Setup"
description: "Set up a productive local dev environment for OpenCodeHub."
---

## Prerequisites

- **Node.js** 20+ (or Bun 1.0+)
- **Git** 2.30+
- **PostgreSQL** 14+ (recommended) or SQLite (for quick setup)
- **Redis** 7+ (optional for local dev, required for background workers)

## Quick Setup

```bash
# Clone the repository
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpencodeHub

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Edit .env with your settings (at minimum, set the secrets)
# Generate secrets with: openssl rand -base64 32
```

## Database

```bash
# Push schema to database (creates tables)
npm run db:push

# Or generate and run migrations
npm run db:generate
npm run db:migrate

# Open Drizzle Studio GUI
npm run db:studio
```

For SQLite (simplest setup), set in `.env`:
```
DATABASE_DRIVER=sqlite
DATABASE_URL=file:./data/opencodehub.db
```

## Seed Admin User

```bash
bun run scripts/seed-admin.ts
```

## Start Development

```bash
# Main app (Web UI + API + Git HTTP)
npm run dev

# SSH Git server (optional, for ssh:// clone/push)
npm run git:start

# Background worker (optional, for webhooks/notifications)
npm run worker:start

# CI runner (optional, for pipeline execution)
npm run runner:start
```

The dev server runs at `http://localhost:4321`.

## Useful Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Astro dev server |
| `npm run build` | Production build |
| `npm run test` | Run Vitest test suite |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Run Astro check |
| `npm run typecheck` | TypeScript type checking |
| `npm run db:push` | Push schema to database |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run git:start` | Start SSH git server |
| `npm run worker:start` | Start background worker |
| `npm run runner:start` | Start CI runner |

## Docker Compose (Alternative)

For a full stack with PostgreSQL and Redis:

```bash
docker-compose up -d
docker-compose exec app bun run scripts/seed-admin.ts
```

This starts the app on port 4321 and SSH on port 2222.

## IDE Setup

- **VS Code**: Install the Astro extension for syntax highlighting
- **Recommended extensions**: Tailwind CSS IntelliSense, ESLint
