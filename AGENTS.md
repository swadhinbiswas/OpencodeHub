# OpenCodeHub — Agent Reference Guide

> **Purpose**: Rapid onboarding for AI agents and developers. Read this first before touching any code.

---

## 1. What Is This?

**OpenCodeHub** is a self-hosted, open-source alternative to GitHub/GitLab. It is a **modular monolith**: one main web app + optional background workers, with pluggable persistence and integrated Git protocol handling.

**Key differentiators**:
- Stack-first PR workflows (Graphite-style stacked PRs)
- Merge queue with speculative builds and priority lanes
- GitHub Actions-compatible CI/CD pipeline engine + Docker-based runner
- Pluggable storage (`local` filesystem or `s3` — any S3-compatible object store: AWS S3, MinIO, Cloudflare R2, Garage, SeaweedFS, Ceph RGW, Wasabi, Backblaze B2, etc.)
- Multi-database support (PostgreSQL, SQLite, Turso/LibSQL)
- Built-in AI code review, automations, webhooks

---

## 2. High-Level Architecture

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
│  │  (Astro+React)│  │  (140+ routes)│  │  (src/pages/api/)   │  │
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

### Runtime Processes
| Process | Command | Purpose |
|---------|---------|---------|
| Main App | `npm run dev` / `astro dev` | Web UI + API + Git HTTP |
| SSH Git | `npm run git:start` | SSH git push/pull server |
| Worker | `npm run worker:start` | Background jobs (queues, webhooks) |
| Runner | `npm run runner:start` | CI/CD pipeline execution |

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro 4.x (SSR mode, `@astrojs/node` standalone adapter) |
| UI | React 18 + Tailwind CSS + Radix UI primitives |
| Database ORM | Drizzle ORM |
| DB Drivers | PostgreSQL (pg), SQLite (better-sqlite3), LibSQL/Turso |
| Auth | JWT (jose) + bcryptjs + TOTP (otplib) + OAuth (arctic) |
| Git | Native `git` CLI + `simple-git` + `isomorphic-git` + `nodegit` |
| SSH | `ssh2` library |
| CI/CD | Dockerode (Docker API) |
| Storage | Abstract adapter pattern; 2 backends (`local`, `s3`-compatible) |
| Realtime | Custom (see `src/lib/realtime.ts`) |
| Queue | BullMQ + Redis |
| CLI | Commander.js + Inquirer + Chalk + `simple-git` |

---

## 4. Directory Structure

```
/home/swadhin/owngit/OpenCodeHub/
├── src/                          # MAIN APPLICATION
│   ├── pages/                    # Astro file-based routing
│   │   ├── api/                  # REST API routes (140+ files)
│   │   │   ├── auth/             # Login, register, OAuth, 2FA
│   │   │   ├── repos/            # Repository CRUD, git endpoints
│   │   │   ├── actions/          # CI/CD pipeline APIs
│   │   │   ├── admin/            # Admin endpoints
│   │   │   ├── user/             # User settings, PATs
│   │   │   ├── stacks/           # Stacked PR APIs
│   │   │   ├── graphql.ts        # GraphQL endpoint
│   │   │   └── openapi.json.ts   # OpenAPI spec endpoint
│   │   ├── [owner]/[repo]/       # Repository pages (issues, PRs, wiki, etc.)
│   │   ├── admin/                # Admin dashboard pages
│   │   ├── git/                  # Git HTTP protocol endpoints
│   │   └── ...                   # Other pages (login, settings, etc.)
│   ├── lib/                      # CORE BUSINESS LOGIC (120+ modules)
│   │   ├── auth.ts               # JWT, sessions, password hashing, 2FA
│   │   ├── git-server.ts         # Git HTTP RPC (upload-pack/receive-pack)
│   │   ├── ssh.ts                # SSH git server implementation
│   │   ├── storage.ts            # Pluggable storage adapters
│   │   ├── pipeline.ts           # CI/CD workflow engine
│   │   ├── stacks.ts             # Stacked PR core logic
│   │   ├── merge-queue.ts        # Merge queue with speculative builds
│   │   ├── pull-requests.ts      # PR CRUD and merge logic
│   │   ├── permissions.ts        # RBAC and repo access control
│   │   ├── webhooks.ts           # Outbound webhook delivery
│   │   ├── automations.ts        # Workflow automation rules
│   │   ├── ai-review.ts          # AI-powered code review
│   │   ├── validation.ts         # Input validation (Zod)
│   │   └── ...                   # Many more specialized modules
│   ├── db/                       # DATABASE LAYER
│   │   ├── index.ts              # DB connection factory (multi-driver)
│   │   ├── schema/               # Drizzle schema definitions (38 tables)
│   │   │   ├── users.ts
│   │   │   ├── repositories.ts
│   │   │   ├── pull-requests.ts
│   │   │   ├── merge-queue.ts
│   │   │   ├── stacked-prs.ts
│   │   │   ├── workflows.ts
│   │   │   └── ...
│   │   └── adapter/              # DB adapter factory
│   ├── components/               # REACT COMPONENTS
│   │   ├── ui/                   # Reusable UI components (shadcn-style)
│   │   ├── pr/                   # Pull request components
│   │   ├── issues/               # Issue tracking components
│   │   ├── queue/                # Merge queue UI
│   │   ├── repo/                 # Repository browser
│   │   └── ...
│   ├── middleware.ts             # Global middleware (auth, rate limit, CSRF, CSP)
│   ├── middleware/               # Middleware modules
│   │   ├── rate-limit.ts
│   │   └── csrf.ts
│   ├── runner/                   # CI RUNNER (in-app)
│   │   ├── index.ts              # Runner entry point
│   │   ├── executor.ts           # Job execution logic
│   │   └── client.ts             # Runner client
│   └── layouts/                  # Astro layouts
│
├── cli/                          # OPENCODEHUB CLI (opencodehub-cli npm package)
│   ├── src/
│   │   ├── commands/             # CLI command groups (20+)
│   │   │   ├── auth.ts           # Login/logout
│   │   │   ├── stack/            # Stack management (create, submit, sync, log)
│   │   │   ├── pr/               # PR operations
│   │   │   ├── queue/            # Merge queue control
│   │   │   ├── focus/            # Interactive focus cockpit
│   │   │   ├── inbox/            # Notification inbox
│   │   │   ├── review/           # Review shortcuts
│   │   │   └── ...
│   │   └── lib/                  # CLI utilities
│   │       ├── api.ts            # API client
│   │       ├── config.ts         # Local config storage
│   │       ├── git.ts            # Git helpers
│   │       └── stack-manager.js  # Stack topology logic
│   └── package.json              # CLI package (name: opencodehub-cli)
│
├── packages/                     # ADDITIONAL PACKAGES
│   ├── git-rpc-daemon/           # Git RPC daemon
│   ├── merge-queue-daemon/       # Merge queue background worker
│   ├── ci-runner/                # Standalone CI runner
│   └── sdk/                      # SDK package
│
├── docs/                         # DOCUMENTATION (Markdown)
│   ├── getting-started/
│   ├── administration/
│   ├── api/
│   ├── features/
│   └── reference/
│
├── docs-site/                    # DOCUMENTATION SITE (Astro-based)
├── deploy/                       # DEPLOYMENT CONFIGS
├── scripts/                      # UTILITY SCRIPTS
│   ├── seed-admin.ts             # Create admin user
│   ├── worker.ts                 # Background worker entry
│   └── backup.ts                 # Backup utility
│
├── docker-compose.yml            # Docker Compose (app + postgres + redis + runner)
├── Dockerfile                    # Main app container
├── Dockerfile.runner             # CI runner container
├── astro.config.mjs              # Astro config (Node standalone adapter)
├── drizzle.config.ts             # Drizzle ORM config
└── package.json                  # Root package (name: opencodehub)
```

---

## 5. Database Schema (38 Tables)

### Core
- `users` — Accounts, passwords, OAuth, 2FA secrets, admin flags
- `repositories` — Git repos, visibility, disk paths, settings
- `organizations` / `teams` / `roles` — Org/team structure

### Git & Collaboration
- `pullRequests` — PRs, states, branches, merge status
- `prStackEntries` / `prStacks` — Stacked PR relationships
- `mergeQueue` — Queue entries with priority, CI status, attempts
- `mergeQueueSpeculativeRuns` — Speculative build tracking
- `branchProtection` / `reviewRequirements` / `requiredStatusChecks` — Branch rules

### Issues & Project Management
- `issues` — Issue tracking
- `projects` / `milestones` / `labels` — Project organization
- `wiki` — Repository wiki pages

### CI/CD
- `workflows` / `workflowRuns` / `workflowJobs` / `workflowSteps` — Pipeline execution
- `pipelineRunners` — Registered CI runners
- `externalCIConfigs` / `externalBuilds` — External CI integration

### Security & Access
- `personalAccessTokens` — PATs for API auth
- `deployKeys` — SSH deploy keys
- `securityPolicies` / `pathPermissions` — Security rules

### Integrations
- `webhooks` — Outbound webhook configs
- `automations` — Automation rules
- `slackIntegration` — Slack notifications
- `sso` — SSO/OIDC config

### AI & Quality
- `aiReviews` / `aiReviewRules` — AI code review results and rules
- `developerMetrics` — PR metrics, cycle time

---

## 6. Key Architectural Patterns

### 6.1 Request Flow
```
Browser/Git CLI → Astro middleware (auth, rate limit, CSRF)
                        ↓
              Route handler (src/pages/api/*.ts)
                        ↓
              Business logic (src/lib/*.ts)
                        ↓
              Database (src/db/index.ts → Drizzle)
```

### 6.2 Authentication
- **Web**: Cookie-based JWT (`och_session`)
- **API**: Bearer token (JWT or Personal Access Token `och_...`)
- **Git HTTP**: Basic auth with PAT as password
- **Git SSH**: Public key auth against `deployKeys` table

### 6.3 Git Protocol Handling
- **HTTP**: `src/pages/git/` routes → `src/lib/git-server.ts` → spawns `git upload-pack/receive-pack`
- **SSH**: `src/lib/ssh.ts` using `ssh2` library → spawns git processes
- **Smart HTTP**: Full pkt-line protocol implementation with sideband

### 6.4 Storage Abstraction
All blob storage goes through `StorageAdapter` abstract class:
- `LocalStorageAdapter` — filesystem rooted at `STORAGE_PATH`
- `S3StorageAdapter` — any S3-compatible object store (AWS S3, MinIO, Cloudflare R2, Garage, SeaweedFS, Ceph RGW, Wasabi, Backblaze B2, ...).  Path-style addressing is enabled automatically when `STORAGE_ENDPOINT` is set.

> Previous releases also shipped GCS, Azure, Google Drive, OneDrive, Dropbox, FTP, and rclone-as-adapter backends.  These were removed in favour of S3-compatible object storage (one code path, multipart semantics, vendor-neutral).  rclone remains available as a separate optional backup utility (`scripts/sync-storage.ts` + `/api/admin/sync`).

Configured via `STORAGE_TYPE` env var (`local` or `s3`).

### 6.5 Database Flexibility
`src/db/index.ts` provides a factory pattern:
- Reads `DATABASE_DRIVER` and `DATABASE_URL` env vars
- Returns appropriate Drizzle instance (SQLite, LibSQL, PostgreSQL)
- **Production**: PostgreSQL strongly recommended (schemas use `pgTable`)
- **Dev**: SQLite or Turso for simplicity

---

## 7. Important Code Locations

| Feature | Key Files |
|---------|-----------|
| **Auth & Sessions** | `src/lib/auth.ts`, `src/middleware.ts` |
| **Git HTTP Server** | `src/lib/git-server.ts`, `src/pages/git/*.ts` |
| **Git SSH Server** | `src/lib/ssh.ts`, `scripts/ssh-server.ts` |
| **Pull Requests** | `src/lib/pull-requests.ts`, `src/pages/[owner]/[repo]/pulls/*` |
| **Stacked PRs** | `src/lib/stacks.ts`, `cli/src/commands/stack/index.ts` |
| **Merge Queue** | `src/lib/merge-queue.ts`, `src/pages/[owner]/[repo]/merge-queue.astro` |
| **CI/CD Engine** | `src/lib/pipeline.ts`, `src/runner/*`, `src/pages/api/actions/*` |
| **Storage** | `src/lib/storage.ts` |
| **Permissions** | `src/lib/permissions.ts` |
| **Webhooks** | `src/lib/webhooks.ts`, `src/pages/api/repos/[owner]/[repo]/webhooks/*` |
| **AI Review** | `src/lib/ai-review.ts`, `src/pages/api/ai-review-rules.ts` |
| **CLI** | `cli/src/commands/*`, `cli/src/lib/*` |
| **Rate Limiting** | `src/middleware/rate-limit.ts` |
| **CSRF Protection** | `src/middleware/csrf.ts` |

---

## 8. CLI Quick Reference

```bash
# Install
npm install -g opencodehub-cli

# Auth
och auth login --url http://localhost:3000

# Stack workflow
och stack create feature/part-1    # Create stacked branch
och stack submit                   # Push all stack branches & create PRs
och stack sync                     # Rebase stack on updated main
och stack log                      # Visualize stack tree

# Merge queue
och queue list
och queue add <pr-number>

# Interactive cockpit
och focus                          # Terminal UI for PRs/queue/reviews
```

---

## 9. Environment Variables (Critical)

| Variable | Purpose |
|----------|---------|
| `DATABASE_DRIVER` / `DATABASE_URL` | Database connection |
| `JWT_SECRET` | JWT signing |
| `SESSION_SECRET` | Session encryption |
| `INTERNAL_HOOK_SECRET` | Git hook security |
| `CRON_SECRET` | Cron endpoint auth |
| `RUNNER_SECRET` | Runner-server shared secret |
| `AI_CONFIG_ENCRYPTION_KEY` | AI provider key encryption |
| `WORKFLOW_SECRET_ENCRYPTION_KEY` | CI secret encryption |
| `STORAGE_TYPE` | Blob storage backend (`local` or `s3`) |
| `REDIS_URL` | Redis for sessions/queues |
| `GIT_REPOS_PATH` | Local git repo storage |
| `GIT_SSH_PORT` | SSH git server port |

See `.env.example` for full list.

---

## 10. Development Commands

```bash
# Setup
cp .env.example .env
npm install
npm run db:push
bun run scripts/seed-admin.ts   # Create admin user

# Dev
npm run dev                     # Start dev server (port 3000)
npm run git:start               # Start SSH git server (port 2222)
npm run worker:start            # Start background worker
npm run runner:start            # Start CI runner

# Quality
npm run lint
npm run typecheck
npm run test
npm run test:coverage

# Database
npm run db:generate
npm run db:migrate
npm run db:studio

# Docker
docker-compose up -d            # Full stack with postgres + redis + runner
```

---

## 11. Testing Strategy

- **Unit**: Vitest (`tests/unit/*.test.ts`)
- **Integration**: Vitest (`tests/integration/*.test.ts`)
- **Security**: Vitest (`tests/security.test.ts`)
- **E2E**: Playwright (`tests/e2e/`)
- **Load**: Custom load tests in `tests/load/`
- **Accessibility**: `@axe-core/playwright`

**Current status: 546 tests passing across 114 test files (100% pass rate)**

---

## 12. Deployment Notes

### Docker Compose (Recommended for self-hosting)
- `docker-compose.yml` spins up: app, PostgreSQL, Redis, CI runner, optional MinIO
- App exposes ports `4321` (web) and `2222` (SSH git)
- Runner requires `privileged: true` for Docker-in-Docker

### Production Checklist
1. Change ALL secrets (JWT_SECRET, SESSION_SECRET, INTERNAL_HOOK_SECRET, CRON_SECRET, RUNNER_SECRET, AI_CONFIG_ENCRYPTION_KEY)
2. Set `SITE_URL` to HTTPS domain
3. Use PostgreSQL (not SQLite)
4. Configure Redis for distributed locking
5. Enable rate limiting (`RATE_LIMIT_ENABLED=true`)
6. Set up email (SMTP) for notifications
7. Configure storage backend (S3/GCS recommended for multi-node)

### Vercel/Edge
- Turso (LibSQL) recommended for edge deployment
- Upstash Redis required for sessions
- Use `@astrojs/vercel` adapter instead of Node

---

## 13. Extension Points

| Extension | How |
|-----------|-----|
| **Storage backends** | Extend `StorageAdapter` in `src/lib/storage.ts` |
| **Database drivers** | Add case in `src/db/index.ts` factory |
| **API routes** | Add files to `src/pages/api/` |
| **CLI commands** | Add command groups to `cli/src/commands/` |
| **Webhooks** | Register in repo settings, handled by `src/lib/webhooks.ts` |
| **CI actions** | Place `.github/workflows/*.yml` in repo |
| **Auth providers** | Add OAuth config in `src/lib/oauth.ts` |

---

## 14. Common Pitfalls

1. **Git operations timeout**: `GIT_PROCESS_TIMEOUT_SECS` default is 300s; increase for large repos
2. **Pack size limits**: `MAX_PACK_SIZE_MB` default is 500MB
3. **SSH host key**: Generated automatically at `GIT_SSH_HOST_KEY` on first start
4. **Runner privileges**: CI runner needs `--privileged` for Docker-in-Docker
5. **Database driver mismatch**: Schemas use `pgTable` — PostgreSQL is required for production
6. **Storage temp files**: Local storage uses `./data/` and `.tmp/` directories
7. **Rate limiting in dev**: Set `RATE_LIMIT_SKIP_DEV=true` only for local testing

---

## 15. Maturity & Roadmap

**Implemented and functional**:
- Git hosting (HTTP + SSH)
- PRs, issues, milestones, project boards
- Wiki, organizations, teams
- Stacked PRs (web + CLI)
- Merge queue with speculative builds
- CI/CD pipeline engine
- Webhooks and automations
- Rate limiting, CSRF, MFA, OAuth
- REST API (140+ routes) + GraphQL
- CLI with 20+ command groups

**Expanding**:
- Advanced CI features (matrix builds, caching)
- Package registry
- Enhanced AI review agents
- Mobile-responsive improvements

See `features.md`, `notimplemented.md`, `github-roadmap-issues.json` for detailed tracking.

---

*Generated for agent context. Keep updated when architecture changes.*
