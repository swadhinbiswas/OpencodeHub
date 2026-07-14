# OpenCodeHub

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="public/logo-light.png">
    <img src="public/logo-light.png" alt="OpenCodeHub" width="380" />
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/v/opencodehub-cli?style=flat-square&label=CLI" alt="CLI version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/swadhinbiswas/OpencodeHub/actions"><img src="https://img.shields.io/badge/CI-passing-success?style=flat-square" alt="CI"></a>
</p>

Self-hosted Git platform with stacked PRs, merge queue, CI/CD, and AI code review. Built for teams that want speed and control.

---

## Quick Start

```bash
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub
cp .env.example .env
docker compose up -d
docker compose exec app bun run scripts/seed-admin.ts
```

Open `http://localhost:4321` and create your admin account.

**Requirements**: Docker, or Node.js 20+ with PostgreSQL.

---

## What It Does

**Git Hosting** — HTTP smart protocol + SSH push/pull. Forks, mirroring, LFS, wiki.

**Stacked PRs** — Break large changes into dependent branches. Each PR builds on the previous. Review in order, merge in order.

**Merge Queue** — Stack-aware merge ordering with speculative CI builds. `main` never breaks.

**CI/CD** — GitHub Actions-compatible workflows. Docker-based runners. Artifacts, secrets, matrix builds.

**AI Code Review** — GPT-4, Claude, Gemini, Groq, Ollama, and 5+ more providers. Catches bugs, security issues, and style problems automatically.

**Issues & Projects** — Labels, milestones, custom fields, kanban boards.

**175+ API Endpoints** — REST + GraphQL. Full programmatic access to everything.

**CLI** — `och` command line tool for stack workflows, reviews, and repository management.

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

### Render (Free)

See [Render Deployment Guide](docs/RENDER-DEPLOYMENT.md). Uses free PostgreSQL + Upstash Redis.

### Other Options

| Platform | Guide |
|----------|-------|
| Docker Compose | [Deployment Guide](docs/administration/deployment.md) |
| NAS (Synology/TrueNAS) | [NAS Guide](docs/administration/deploy-nas.md) |
| Kubernetes | [K8s Guide](docs/administration/kubernetes.md) |
| Cloudflare Tunnel | [Cloudflare Guide](docs/administration/deploy-cloudflare.md) |
| Free Tier Options | [Free Deployment](docs/FREE-DEPLOYMENT.md) |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Astro 4.x SSR + React 18 |
| Database | PostgreSQL, SQLite, Turso (Drizzle ORM) |
| Auth | JWT, OAuth, 2FA/TOTP, SSO/SAML |
| CI/CD | Docker-based runners, GitHub Actions syntax |
| Storage | Local, S3, MinIO, R2, or any S3-compatible |
| CLI | Commander.js (`npm i -g opencodehub-cli`) |

---

## Documentation

Full docs at [docs.opencodehub.space](https://docs.opencodehub.space/):

- [Installation](https://docs.opencodehub.space/getting-started/installation/)
- [Configuration](https://docs.opencodehub.space/administration/configuration/)
- [Stacked PRs](https://docs.opencodehub.space/features/stacked-prs/)
- [AI Code Review](https://docs.opencodehub.space/features/ai-review/)
- [CLI Reference](https://docs.opencodehub.space/reference/cli-commands/)
- [API Reference](https://docs.opencodehub.space/api/rest-api/)

---

## CLI

```bash
npm install -g opencodehub-cli

och auth login --url http://localhost:4321
och stack create feature/auth
och stack submit
och focus
```

---

## Contributing

1. Fork the repo
2. Create a branch
3. `npm install && npm run db:push && npm run dev`
4. Run tests: `npm run test`
5. Open a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## License

MIT
