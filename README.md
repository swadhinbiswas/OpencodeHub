# OpenCodeHub

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="public/logo-light.png">
    <img src="public/logo-light.png" alt="OpenCodeHub Logo" width="420" />
  </picture>
</p>

<p align="center">
  <strong>A modern self-hosted Git platform for teams that want speed, control, and clean workflows.</strong>
</p>

<p align="center">
  OpenCodeHub combines Git hosting, pull requests, issues, wiki, merge queue, automation, and a stack-first CLI in one deployable system.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/v/opencodehub-cli?style=flat-square&label=CLI" alt="CLI version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="docs/index.md"><img src="https://img.shields.io/badge/docs-available-success?style=flat-square" alt="Docs"></a>
</p>

---

## Why OpenCodeHub

Most teams eventually hit the same pain points:

- PRs are too large to review quickly
- Tooling is split across many services
- Data residency and security requirements are hard to satisfy in SaaS-only setups

OpenCodeHub is built for that reality: self-hosted by default, with workflows optimized for fast review cycles and scalable team collaboration.

## What Is Already In This Codebase

These are not roadmap claims; they are implemented modules and routes in this repository.

### Core platform

- Git hosting over HTTP and SSH (`src/pages/git/*`, `src/lib/ssh.ts`, `src/lib/git-server.ts`)
- Pull requests with comments, reviews, drafts, approvals (`src/pages/[owner]/[repo]/pulls/*`)
- Issues, labels, milestones, and project boards (`src/pages/[owner]/[repo]/issues/*`, `src/pages/[owner]/[repo]/milestones/*`, `src/pages/[owner]/[repo]/projects/*`)
- Repository wiki and revision history (`src/pages/[owner]/[repo]/wiki/*`)
- Organizations, collaborators, repository settings, branch protection

### Delivery workflows

- Stacked PR workflows in web + CLI (`src/lib/stacks.ts`, `cli/src/commands/stack/index.ts`)
- Merge queue and conflict handling (`src/lib/merge-queue.ts`, `src/pages/[owner]/[repo]/merge-queue.astro`)
- GitHub Actions-style pipeline engine + runner endpoints (`src/lib/pipeline.ts`, `src/pages/api/actions/*`, `src/runner/*`)
- Webhooks and automation rules (`src/pages/api/repos/[owner]/[repo]/webhooks/*`, `src/lib/automations.ts`)

### Security and governance

- Rate limiting middleware (`src/middleware/rate-limit.ts`, `src/middleware.ts`)
- CSRF utilities (`src/middleware/csrf.ts`)
- Input validation layer (`src/lib/validation.ts`)
- MFA (TOTP), OAuth/OIDC, token management, audit surfaces (`src/pages/api/user/settings/2fa.ts`, `src/lib/oidc.ts`, `src/pages/admin/audit.astro`)

### Extensibility and APIs

- REST API routes: 140+ files under `src/pages/api/`
- GraphQL endpoint (`src/pages/api/graphql.ts`)
- OpenAPI JSON endpoint (`src/pages/api/openapi.json.ts`)
- CLI with 20+ command groups under `cli/src/commands/`

### Storage and database flexibility

- Database adapter factory with multiple drivers (`src/db/adapter/index.ts`)
- Pluggable storage backends (`src/lib/storage.ts`)

---

## Architecture

<p align="center">
  <img src="public/architecture.svg" alt="OpenCodeHub Architecture" width="900" />
</p>

OpenCodeHub is a modular monolith: one main app, optional worker/runner processes, pluggable persistence, and Git protocol handling integrated into the platform.

---

## Quick Start (Local)

### Prerequisites

- `Node.js >= 20`
- `npm`
- `git`
- `bun` (recommended; used by helper scripts like admin seeding)

### 1) Clone and install

```bash
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub
npm install
```

### 2) Configure environment

```bash
cp .env.example .env
```

For local development, SQLite defaults in `.env.example` are enough to start.

### 3) Initialize database

```bash
npm run db:push
```

### 4) Create an admin user

```bash
bun run scripts/seed-admin.ts
```

### 5) Start development server

```bash
npm run dev
```

App URL: `http://localhost:3000`

---

## Quick Start (Docker Compose)

```bash
cp .env.example .env
docker-compose up -d
```

Default Docker app URL: `http://localhost:4321`

Optional admin user creation:

```bash
docker-compose exec app bun run scripts/seed-admin.ts
```

---

## Production Notes

Before production deployment, set strong values for at least:

- `JWT_SECRET`
- `SESSION_SECRET`
- `INTERNAL_HOOK_SECRET`
- `CRON_SECRET`
- `RUNNER_SECRET`
- `AI_CONFIG_ENCRYPTION_KEY`
- `SITE_URL` (HTTPS)

Useful references:

- `DEPLOYMENT.md`
- `docs/administration/deployment.md`
- `docs/administration/security.md`

---

## Common Commands

```bash
# App lifecycle
npm run dev
npm run build
npm run preview

# Code quality and tests
npm run lint
npm run typecheck
npm run test
npm run test:coverage

# Database
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio

# Optional background processes
npm run worker:start
npm run runner:start
npm run git:start
```

---

## OpenCodeHub CLI

The companion CLI is published as `opencodehub-cli` and implemented in `cli/`.

Install and test:

```bash
npm install -g opencodehub-cli
och --help
```

Typical flow:

```bash
och auth login --url http://localhost:3000
och init --url http://localhost:3000
och stack create feature/auth-step-1
och stack submit
och queue list
```

---

## Documentation Map

- Platform docs: `docs/`
- Docs site source: `docs-site/`
- API docs entry: `docs/api/rest-api.md`
- CLI reference: `docs/reference/cli-commands.md`
- Contribution guide: `CONTRIBUTING.md`

---

## Project Maturity

OpenCodeHub is active and evolving. Core collaboration features are functional, while some advanced areas are still being expanded.

Tracking documents:

- `doc/feature_audit.md`
- `doc/missing_implementation_tracker.md`
- `github-issues-checklist.md`

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a branch
3. Run lint/tests
4. Open a pull request

See `CONTRIBUTING.md` for development workflow and standards.

## License

MIT. See `LICENSE`.
