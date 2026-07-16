# OpenCodeHub

![OpenCodeHub](https://raw.githubusercontent.com/swadhinbiswas/OpencodeHub/main/public/logo-light.png)

**The self-hosted Git platform that doesn't compromise.**

OpenCodeHub is a self-hosted Git platform with stacked PRs, merge queue, CI/CD pipelines, and AI code review. One platform for everything your team needs — no vendor lock-in, no per-seat pricing.

---

## Features

- **Stacked PRs** — Graphite-style stacked branches for incremental review
- **Merge Queue** — Stack-aware merge ordering with speculative CI builds
- **CI/CD Pipelines** — GitHub Actions-compatible workflows with Docker runners
- **AI Code Review** — 10+ providers: GPT-4, Claude, Gemini, Groq, Ollama
- **Git Hosting** — HTTP smart protocol + SSH push/pull, forks, mirroring, LFS
- **Issues & Projects** — Labels, milestones, custom fields, kanban boards
- **175+ API Endpoints** — REST + GraphQL for full programmatic access
- **CLI** — `och` command line tool for stack workflows and repository management

---

## Quick Start

```bash
# Pull and run
docker run -d \
  --name opencodehub \
  -p 4321:4321 \
  -v opencodehub-data:/data \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e DATABASE_URL=postgresql://user:pass@db:5432/opencodehub \
  opencodehub/opencodehub:latest
```

Or with Docker Compose:

```bash
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub
cp .env.example .env
docker compose up -d
docker compose exec app bun run scripts/seed-admin.ts
```

Open **http://localhost:4321** and create your admin account.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Random 32+ char string for JWT signing |
| `SESSION_SECRET` | Yes | Random 32+ char string for session encryption |
| `REDIS_URL` | Yes | Redis connection string |
| `SITE_URL` | Yes | Your public URL (e.g., `https://git.example.com`) |
| `STORAGE_TYPE` | No | `local` (default) or `s3` |

---

## Documentation

Full documentation: **[docs.opencodehub.space](https://docs.opencodehub.space)**

- [Installation Guide](https://docs.opencodehub.space/getting-started/installation/)
- [Configuration Reference](https://docs.opencodehub.space/administration/configuration/)
- [Deployment Options](https://docs.opencodehub.space/administration/deployment/)
- [CLI Reference](https://docs.opencodehub.space/reference/cli-commands/)
- [API Reference](https://docs.opencodehub.space/api/rest-api/)

---

## Links

- **GitHub**: [github.com/swadhinbiswas/OpencodeHub](https://github.com/swadhinbiswas/OpencodeHub)
- **Documentation**: [docs.opencodehub.space](https://docs.opencodehub.space)
- **License**: MIT
