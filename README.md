<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="public/logo-light.png">
    <img src="public/logo-light.png" alt="OpenCodeHub" width="420" />
  </picture>
</p>

<h3 align="center">The self-hosted Git platform that doesn't compromise.</h3>

<p align="center">
  <a href="https://github.com/swadhinbiswas/OpencodeHub/actions"><img src="https://img.shields.io/badge/CI-passing-brightgreen?style=for-the-badge" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"></a>
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/v/opencodehub-cli?style=for-the-badge&label=CLI" alt="CLI version"></a>
  <a href="https://docs.opencodehub.space"><img src="https://img.shields.io/badge/docs-opencodehub.space-brightgreen?style=for-the-badge" alt="Docs"></a>
  <a href="https://hub.docker.com/r/opencodehub/opencodehub"><img src="https://img.shields.io/badge/docker-opencodehub%2Fopencodehub-blue?style=for-the-badge&logo=docker" alt="Docker"></a>
</p>

---

OpenCodeHub is a self-hosted Git platform with **stacked PRs**, **merge queue**, **CI/CD pipelines**, and **AI code review**. One platform for everything your team needs — no vendor lock-in, no per-seat pricing.

**[Documentation](https://docs.opencodehub.space)** · **[Deploy in 5 minutes](#deploy)** · **[CLI Reference](https://docs.opencodehub.space/reference/cli-commands/)**

---

## Demo

<!-- Replace VIDEO_ID with your YouTube video ID -->
[![OpenCodeHub Demo](https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg)](https://youtu.be/VIDEO_ID)

*Watch the full walkthrough — deployment, stacked PRs, AI review, and merge queue in action.*

---

## Why OpenCodeHub?

| Problem | Solution |
|---------|----------|
| PRs too large to review | **Stacked PRs** — break changes into small, dependent branches |
| Merge conflicts on main | **Merge Queue** — stack-aware ordering with speculative CI builds |
| Slow review cycles | **AI Code Review** — catches bugs before humans even look |
| Split across 5+ services | **All-in-one** — Git, PRs, CI/CD, issues, wiki in one place |
| Data leaves your servers | **Self-hosted** — your code stays on your hardware |

---

## Features

### Core Platform
- **Git Hosting** — HTTP smart protocol + SSH push/pull, forks, mirroring, LFS
- **Pull Requests** — Inline comments, approvals, suggested changes, draft PRs
- **Issues & Projects** — Labels, milestones, custom fields, kanban boards
- **Wiki** — Repository wiki with revision history
- **Organizations** — Teams, collaborators, role-based access control

### Delivery Workflows
- **Stacked PRs** — Graphite-style stacked branches with web + CLI support
- **Merge Queue** — Stack-aware queue with speculative builds and priority lanes
- **CI/CD Pipelines** — GitHub Actions-compatible engine with Docker-based runners
- **Webhooks** — Outbound webhooks with event filtering and HMAC signing
- **Automations** — Rule-based workflow automation for PRs and deployments

### AI & Quality
- **AI Code Review** — 10+ providers: GPT-4, Claude, Gemini, Groq, Ollama, OpenRouter
- **Secret Scanning** — Detect secrets in commits before they reach production
- **Branch Protection** — Required reviews, status checks, push restrictions
- **Developer Metrics** — PR velocity, review efficiency, time-to-merge tracking

### Security
- **Authentication** — JWT sessions, OAuth (GitHub, Google, GitLab), 2FA/TOTP, SSO/SAML
- **Authorization** — RBAC with roles, team permissions, collaborator levels
- **Rate Limiting** — Redis-backed per-endpoint rate limiting
- **Audit Logging** — Track all administrative actions

### Extensibility
- **REST API** — 175+ endpoints covering all platform features
- **GraphQL** — Full GraphQL endpoint for flexible queries
- **CLI** — `och` command line tool with 20+ command groups
- **Storage** — Local, S3, MinIO, R2, or any S3-compatible backend

---

## Deploy

### Docker (Recommended)

```bash
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub
cp .env.example .env
docker compose up -d
docker compose exec app bun run scripts/seed-admin.ts
```

Open **http://localhost:4321** and create your admin account.

### Render (Free)

Deploy to Render with free PostgreSQL + Upstash Redis:

```bash
# 1. Create free Redis at upstash.com (Singapore region)
# 2. Push to GitHub
# 3. Render → New → Blueprint → Select your repo
# 4. Set REDIS_URL and SITE_URL
# 5. Deploy
```

See the [Render Deployment Guide](docs/RENDER-DEPLOYMENT.md) for step-by-step instructions.

### More Deployment Options

| Platform | Guide | Cost |
|----------|-------|------|
| Docker Compose | [Deployment Guide](docs/administration/deployment.md) | Free |
| Render (Asia) | [Render Guide](docs/RENDER-DEPLOYMENT.md) | Free |
| Oracle Cloud | [Free Deployment](docs/FREE-DEPLOYMENT.md) | Free forever |
| NAS (Synology/TrueNAS) | [NAS Guide](docs/administration/deploy-nas.md) | Free |
| Kubernetes | [K8s Guide](docs/administration/kubernetes.md) | Free |
| Cloudflare Tunnel | [Cloudflare Guide](docs/administration/deploy-cloudflare.md) | Free |

---

## CLI

```bash
# Install
npm install -g opencodehub-cli

# Login
och auth login --url http://localhost:4321

# Stacked PR workflow
och stack create feature/auth-step-1
och stack submit
och stack sync

# Merge queue
och queue list
och queue add <pr-number>

# Interactive cockpit
och focus
```

[Full CLI Reference](https://docs.opencodehub.space/reference/cli-commands/)

---

## API

```bash
# Create a repository
curl -X POST http://localhost:4321/api/repos \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-project","visibility":"public"}'

# List pull requests
curl http://localhost:4321/api/repos/owner/repo/pulls \
  -H "Authorization: Bearer YOUR_TOKEN"

# GraphQL
curl -X POST http://localhost:4321/api/graphql \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ repositories { name owner { username } } }"}'
```

[Full API Reference](https://docs.opencodehub.space/api/rest-api/)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro 4.x (SSR) + React 18 |
| UI | Tailwind CSS + Radix UI |
| Database | PostgreSQL / SQLite / Turso (Drizzle ORM) |
| Auth | JWT + OAuth + 2FA/TOTP + SSO/SAML |
| Git | Native git CLI + simple-git + isomorphic-git |
| SSH | ssh2 library |
| CI/CD | Docker-based runners, GitHub Actions syntax |
| Storage | Local filesystem or S3-compatible (AWS, MinIO, R2) |
| AI | OpenAI, Anthropic, Google, Groq, Ollama, OpenRouter |
| Queue | BullMQ + Redis |
| CLI | Commander.js + Inquirer |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│  Browser  │  Git CLI (HTTP/SSH)  │  OpenCodeHub CLI (och)   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    OPENCODEHUB PLATFORM                      │
│  Web UI (Astro+React)  │  REST API (175+ routes)  │ GraphQL │
│  Git Server (HTTP)     │  SSH Server (ssh2)       │         │
│  Pipeline Runner (Docker)                          │         │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL/SQLite/Turso  │  Redis  │  Pluggable Storage    │
└─────────────────────────────────────────────────────────────┘
```

---

## Documentation

| Topic | Link |
|-------|------|
| Installation | [docs.opencodehub.space/getting-started/installation](https://docs.opencodehub.space/getting-started/installation/) |
| Configuration | [docs.opencodehub.space/administration/configuration](https://docs.opencodehub.space/administration/configuration/) |
| Stacked PRs | [docs.opencodehub.space/features/stacked-prs](https://docs.opencodehub.space/features/stacked-prs/) |
| AI Code Review | [docs.opencodehub.space/features/ai-review](https://docs.opencodehub.space/features/ai-review/) |
| CLI Reference | [docs.opencodehub.space/reference/cli-commands](https://docs.opencodehub.space/reference/cli-commands/) |
| API Reference | [docs.opencodehub.space/api/rest-api](https://docs.opencodehub.space/api/rest-api/) |
| Deployment | [docs.opencodehub.space/administration/deployment](https://docs.opencodehub.space/administration/deployment/) |

---

## Contributing

```bash
# Clone and setup
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub
cp .env.example .env
npm install
npm run db:push
bun run scripts/seed-admin.ts

# Start development
npm run dev

# Run tests
npm run test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and standards.

---

## Community

- **GitHub**: [github.com/swadhinbiswas/OpencodeHub](https://github.com/swadhinbiswas/OpencodeHub)
- **Documentation**: [docs.opencodehub.space](https://docs.opencodehub.space)
- **Issues**: [GitHub Issues](https://github.com/swadhinbiswas/OpencodeHub/issues)
- **Discussions**: [GitHub Discussions](https://github.com/swadhinbiswas/OpencodeHub/discussions)

---

## License

[MIT](LICENSE) — Use it however you want.
