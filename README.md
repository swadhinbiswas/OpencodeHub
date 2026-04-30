# OpenCodeHub

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="public/logo-light.png">
    <img src="public/logo-light.png" alt="OpenCodeHub Logo" width="420" />
  </picture>
</p>

<p align="center">
  <strong>A modern, self-hosted Git platform for teams that want speed, control, and clean workflows.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/v/opencodehub-cli?style=flat-square&label=CLI" alt="CLI version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="docs/index.md"><img src="https://img.shields.io/badge/docs-available-success?style=flat-square" alt="Docs"></a>
  <a href="https://github.com/swadhinbiswas/OpencodeHub/actions"><img src="https://img.shields.io/badge/CI-passing-success?style=flat-square" alt="CI"></a>
</p>

---

## Table of Contents

- [Why OpenCodeHub](#why-opencodehub)
- [Features](#features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [CLI](#cli)
- [API](#api)
- [Security](#security)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Why OpenCodeHub

Most teams eventually hit the same pain points:

- **PRs are too large to review quickly** — Stacked PRs let you break changes into reviewable pieces
- **Tooling is split across many services** — One platform for Git, PRs, CI/CD, issues, and wiki
- **Data residency and security requirements** — Self-hosted by default, you control everything
- **Merge queue complexity** — Stack-aware merge queue with speculative builds
- **Slow review cycles** — AI-powered code review catches issues before human review

OpenCodeHub is built for that reality.

---

## Features

### Core Platform

| Feature | Status | Description |
|---------|--------|-------------|
| **Git Hosting** | Ready | HTTP (Smart Protocol) + SSH git push/pull |
| **Pull Requests** | Ready | Comments, reviews, drafts, approvals, suggested changes |
| **Issues** | Ready | Labels, milestones, project boards |
| **Wiki** | Ready | Repository wiki with revision history |
| **Organizations** | Ready | Teams, collaborators, repository settings |
| **Branch Protection** | Ready | Required reviews, status checks, push restrictions |

### Delivery Workflows

| Feature | Status | Description |
|---------|--------|-------------|
| **Stacked PRs** | Ready | Graphite-style stack workflows in web + CLI |
| **Merge Queue** | Ready | Stack-aware queue with speculative builds and priority lanes |
| **CI/CD Pipelines** | Ready | GitHub Actions-compatible engine + Docker-based runner |
| **Webhooks** | Ready | Outbound webhooks with event filtering |
| **Automations** | Ready | Workflow automation rules |

### Security & Governance

| Feature | Status | Description |
|---------|--------|-------------|
| **Authentication** | Ready | JWT sessions, OAuth (GitHub, Google, GitLab), 2FA/TOTP |
| **Authorization** | Ready | RBAC with roles, team permissions, collaborator levels |
| **Rate Limiting** | Ready | Redis-backed per-endpoint rate limiting |
| **CSRF Protection** | Ready | Double-submit cookie pattern |
| **Secret Scanning** | Ready | Detect secrets in commits |
| **Audit Logging** | Ready | Track all administrative actions |

### Extensibility

| Feature | Status | Description |
|---------|--------|-------------|
| **REST API** | Ready | 140+ API routes |
| **GraphQL** | Ready | Full GraphQL endpoint |
| **OpenAPI** | Ready | Auto-generated OpenAPI spec |
| **CLI** | Ready | 20+ command groups (`opencodehub-cli`) |
| **Storage Adapters** | Ready | 8+ backends (S3, GCS, Azure, Google Drive, etc.) |

---

## Quick Start

### Prerequisites

- Node.js >= 20
- npm or bun
- git
- PostgreSQL 14+ (recommended) or SQLite (dev)

### Docker (Fastest)

```bash
# 1. Clone
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub

# 2. Configure
cp .env.example .env
# Edit .env with your settings

# 3. Start
docker-compose up -d

# 4. Create admin user
docker-compose exec app bun run scripts/seed-admin.ts

# 5. Open
open http://localhost:4321
```

### Manual Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env (SQLite defaults work for dev)

# 3. Initialize database
npm run db:push

# 4. Create admin user
bun run scripts/seed-admin.ts

# 5. Start development server
npm run dev
```

App URL: `http://localhost:3000` (dev) or `http://localhost:4321` (Docker)

---

## Architecture

```
Clients (Browser / Git CLI / och CLI)
    |
    v
OpenCodeHub Platform (Astro SSR + React)
    |-- Web UI
    |-- REST API (140+ routes)
    |-- GraphQL Endpoint
    |-- Git HTTP Server
    |-- SSH Git Server (port 2222)
    |
    v
Persistence Layer
    |-- PostgreSQL / SQLite / Turso (Drizzle ORM)
    |-- Redis (sessions, queues, caching)
    |-- Pluggable Storage (S3, GCS, Azure, local, etc.)
```

### Runtime Processes

| Process | Command | Purpose |
|---------|---------|---------|
| Main App | `npm run dev` | Web UI + API + Git HTTP |
| SSH Git | `npm run git:start` | SSH git push/pull |
| Worker | `npm run worker:start` | Background jobs |
| Runner | `npm run runner:start` | CI/CD pipeline execution |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro 4.x (SSR, Node standalone) |
| UI | React 18 + Tailwind CSS + Radix UI |
| Database | Drizzle ORM (PostgreSQL, SQLite, Turso) |
| Auth | JWT (jose) + bcryptjs + TOTP (otplib) + OAuth (arctic) |
| Git | Native git CLI + simple-git + isomorphic-git |
| SSH | ssh2 library |
| CI/CD | Dockerode (Docker API) |
| Storage | Abstract adapter pattern (8+ backends) |
| Queue | BullMQ + Redis |
| CLI | Commander.js + Inquirer + simple-git |

---

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[Getting Started](docs/getting-started/installation.md)** — Installation and setup
- **[Features](docs/features/)** — Stacked PRs, AI review, merge queue, CI/CD
- **[Guides](docs/guides/)** — Team workflows, branch protection, webhooks
- **[API Reference](docs/api/rest-api.md)** — REST API documentation
- **[Administration](docs/administration/)** — Deployment, security, monitoring
- **[Development](docs/development/)** — Architecture, contributing, testing
- **[Tutorials](docs/tutorials/)** — Hands-on guides

---

## CLI

The companion CLI is published as `opencodehub-cli`:

```bash
# Install
npm install -g opencodehub-cli

# Authenticate
och auth login --url http://localhost:4321

# Stack workflow
och stack create feature/auth-step-1
och stack submit
och stack sync

# Merge queue
och queue list
och queue add <pr-number>

# Interactive cockpit
och focus
```

[Full CLI Reference](docs/reference/cli-commands.md)

---

## API

OpenCodeHub provides multiple API interfaces:

### REST API

140+ REST endpoints covering all platform features:

```bash
# Authentication
curl -X POST http://localhost:4321/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"alice","password":"secret"}'

# Create repository
curl -X POST http://localhost:4321/api/repos \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-project","visibility":"public"}'

# List pull requests
curl http://localhost:4321/api/repos/alice/my-project/pulls \
  -H "Authorization: Bearer <token>"
```

### GraphQL

```bash
curl -X POST http://localhost:4321/api/graphql \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ repositories { name owner { username } } }"}'
```

### OpenAPI Spec

The OpenAPI spec is available at:
```
GET /api/openapi.json
```

---

## Security

OpenCodeHub implements comprehensive security controls:

- **Authentication**: JWT sessions with secure cookies, OAuth 2.0, 2FA/TOTP
- **Authorization**: Role-based access control (RBAC), repository permissions, team permissions
- **Data Protection**: AES-256-GCM encryption for workflow secrets and AI config
- **Transport**: HTTPS enforcement in production, TLS 1.2+
- **CSRF**: Double-submit cookie pattern for state-changing requests
- **Rate Limiting**: Redis-backed per-endpoint rate limiting
- **Input Validation**: Zod schema validation on all API inputs
- **Secret Scanning**: Detect and block secrets in commits
- **SSRF Protection**: Validate webhook URLs against private IP ranges

See [Security Best Practices](docs/administration/security.md) for detailed configuration.

---

## Deployment

### Docker Compose (Recommended)

The included `docker-compose.yml` spins up:
- OpenCodeHub app (port 4321)
- PostgreSQL database
- Redis cache
- CI runner (Docker-in-Docker)
- Optional: MinIO for S3-compatible storage

```bash
docker-compose up -d
```

### Production Checklist

Before deploying to production:

1. **Change ALL secrets**:
   ```bash
   JWT_SECRET=$(openssl rand -hex 32)
   SESSION_SECRET=$(openssl rand -hex 32)
   INTERNAL_HOOK_SECRET=$(openssl rand -hex 32)
   CRON_SECRET=$(openssl rand -hex 32)
   RUNNER_SECRET=$(openssl rand -hex 32)
   WORKFLOW_SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```

2. **Use PostgreSQL** (not SQLite)
3. **Configure HTTPS** with reverse proxy (Nginx/Caddy)
4. **Set up Redis** for distributed sessions and rate limiting
5. **Configure external storage** (S3/GCS/Azure instead of local)
6. **Enable rate limiting**: `RATE_LIMIT_ENABLED=true`
7. **Set up SMTP** for email notifications
8. **Configure backups** for PostgreSQL data

See [Deployment Guide](docs/administration/deployment.md) for detailed instructions.

---

## Database

OpenCodeHub uses Drizzle ORM with support for multiple database engines:

| Engine | Driver | Use Case |
|--------|--------|----------|
| **PostgreSQL** | `pg` | Production (recommended) |
| **SQLite** | `better-sqlite3` | Development, small deployments |
| **Turso/LibSQL** | `@libsql/client` | Edge deployments, Vercel |

```bash
# Generate migrations
npm run db:generate

# Apply migrations
npm run db:migrate

# Push schema (dev)
npm run db:push

# Open Drizzle Studio
npm run db:studio
```

---

## Storage

All blob storage goes through an abstract `StorageAdapter`:

| Backend | Adapter | Use Case |
|---------|---------|----------|
| **Local** | `LocalStorageAdapter` | Development, single-node |
| **S3** | `S3StorageAdapter` | Production (AWS, MinIO, R2) |
| **Google Cloud** | `GCSStorageAdapter` | GCP deployments |
| **Azure Blob** | `AzureStorageAdapter` | Azure deployments |
| **Google Drive** | `GoogleDriveStorageAdapter` | Personal/small team |
| **OneDrive** | `OneDriveStorageAdapter` | Microsoft ecosystem |
| **Dropbox** | `DropboxStorageAdapter` | Simple cloud storage |
| **Rclone** | `RcloneStorageAdapter` | Any rclone-compatible remote |

Configure via `STORAGE_DRIVER` environment variable.

---

## Development

```bash
# Setup
cp .env.example .env
npm install
npm run db:push
bun run scripts/seed-admin.ts

# Dev server
npm run dev        # Web UI + API (port 3000)
npm run git:start  # SSH git server (port 2222)
npm run worker:start  # Background worker
npm run runner:start  # CI runner

# Quality
npm run lint
npm run typecheck
npm run test
npm run test:coverage

# Database
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
```

See [Contributing Guide](CONTRIBUTING.md) and [Development Docs](docs/development/).

---

## Project Structure

```
OpenCodeHub/
├── src/                    # Main application
│   ├── pages/              # Astro routes (UI + API)
│   ├── lib/                # Core business logic (120+ modules)
│   ├── db/                 # Database schema and connection
│   ├── components/         # React components
│   ├── middleware.ts       # Global middleware
│   └── runner/             # CI runner
├── cli/                    # CLI package (opencodehub-cli)
│   └── src/commands/       # CLI command groups
├── packages/               # Additional packages
│   ├── git-rpc-daemon/
│   ├── merge-queue-daemon/
│   ├── ci-runner/
│   └── sdk/
├── docs/                   # Documentation
├── docs-site/              # Documentation website
├── scripts/                # Utility scripts
├── docker-compose.yml      # Docker Compose setup
├── Dockerfile              # Main app container
└── package.json
```

---

## Testing

- **Unit Tests**: Vitest (`*.test.ts`)
- **E2E Tests**: Playwright
- **Load Tests**: Custom load tests in `tests/load/`
- **Accessibility**: `@axe-core/playwright`

```bash
npm run test           # Run all tests
npm run test:coverage  # Run with coverage
```

---

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Run lint and tests
4. Open a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and standards.

---

## Community

- **Documentation**: [docs/index.md](docs/index.md)
- **Issues**: [GitHub Issues](https://github.com/swadhinbiswas/OpencodeHub/issues)
- **Discussions**: [GitHub Discussions](https://github.com/swadhinbiswas/OpencodeHub/discussions)

---

## License

MIT. See [LICENSE](LICENSE).

---

<p align="center">
  <strong>Ready to get started?</strong><br>
  <a href="docs/getting-started/installation.md">Install OpenCodeHub</a> |
  <a href="docs/getting-started/quick-start.md">Quick Start</a> |
  <a href="docs/features/stacked-prs.md">Learn Stacked PRs</a>
</p>
