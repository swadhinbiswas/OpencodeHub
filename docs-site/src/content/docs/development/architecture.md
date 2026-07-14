---
title: "System Architecture"
description: "High-level overview of OpenCodeHub's components and data flow."
---

OpenCodeHub is a modular monolith built for performance and self-hosting simplicity.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│  Browser  │  Git CLI (HTTP/SSH)  │  OpenCodeHub CLI (och)   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    OPENCODEHUB PLATFORM                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Web UI     │  │  REST API   │  │  GraphQL Endpoint   │  │
│  │  (Astro+React)│  │  (175+ routes)│  │  (src/pages/api/)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Git Server │  │  SSH Server │  │  Pipeline Runner    │  │
│  │  (HTTP RPC) │  │  (ssh2)     │  │  (Docker executor)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              PERSISTENCE & INFRASTRUCTURE                    │
│  PostgreSQL/SQLite/Turso  │  Redis  │  Pluggable Storage    │
└─────────────────────────────────────────────────────────────┘
```

## Runtime Processes

| Process | Command | Purpose |
|---------|---------|---------|
| Main App | `npm run dev` | Web UI + API + Git HTTP |
| SSH Git | `npm run git:start` | SSH git push/pull server |
| Worker | `npm run worker:start` | Background jobs (BullMQ queues) |
| Runner | `npm run runner:start` | CI/CD pipeline execution (Docker) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro 4.x (SSR mode, `@astrojs/node` standalone adapter) |
| UI | React 18 + Tailwind CSS + Radix UI primitives |
| Database ORM | Drizzle ORM |
| DB Drivers | PostgreSQL (pg), SQLite (better-sqlite3), LibSQL/Turso |
| Auth | JWT (jose) + bcryptjs + TOTP (otplib) + OAuth (arctic) + SSO/SAML/OIDC |
| Git | Native `git` CLI + `simple-git` + `isomorphic-git` + `nodegit` |
| SSH | `ssh2` library |
| CI/CD | Dockerode (Docker API) |
| Storage | Abstract adapter: `local` filesystem or `s3`-compatible |
| AI | OpenAI, Anthropic, Google, Groq, Ollama, OpenRouter, Together, Bytez |
| Queue | BullMQ + Redis |
| Observability | OpenTelemetry + Prometheus + Pino |

## Request Flow

```
Browser/Git CLI → Astro middleware (auth, rate limit, CSRF)
                        ↓
              Route handler (src/pages/api/*.ts)
                        ↓
              Business logic (src/lib/*.ts)
                        ↓
              Database (src/db/index.ts → Drizzle)
```

## Authentication

- **Web**: Cookie-based JWT (`och_session`)
- **API**: Bearer token (JWT or Personal Access Token `och_...`)
- **Git HTTP**: Basic auth with PAT as password
- **Git SSH**: Public key auth against `deployKeys` table
- **SSO**: SAML and OIDC via admin-configured providers

## Git Protocol Handling

- **HTTP**: `src/pages/git/` routes → `src/lib/git-server.ts` → spawns `git upload-pack/receive-pack`
- **SSH**: `src/lib/ssh.ts` using `ssh2` library → spawns git processes
- **Smart HTTP**: Full pkt-line protocol implementation with sideband

## Storage Abstraction

All blob storage goes through `StorageAdapter`:
- `LocalStorageAdapter` — filesystem at `STORAGE_PATH`
- `S3StorageAdapter` — any S3-compatible store (AWS, MinIO, R2, Garage, Wasabi, etc.)

Path-style addressing is enabled automatically when `STORAGE_ENDPOINT` is set.

## Database

`src/db/index.ts` provides a factory pattern:
- Reads `DATABASE_DRIVER` and `DATABASE_URL`
- Returns appropriate Drizzle instance
- **Production**: PostgreSQL required (schemas use `pgTable`)
- **Dev**: SQLite or Turso for simplicity

38 schema tables cover users, repos, PRs, issues, projects, workflows, merge queue, stacked PRs, AI reviews, security policies, and more.

## Background Workers

The worker process (`npm run worker:start`) handles:
- BullMQ job queues for webhooks, notifications, CI triggers
- Cron jobs (garbage collection, mirror sync, notification digests)
- Email delivery via SMTP
- Real-time SSE event broadcasting
