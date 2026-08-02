# OpenCodeHub

[![Docker Image Size](https://img.shields.io/docker/image-size/opencodehub/opencodehub/latest?style=flat-square&color=blue)](https://hub.docker.com/r/opencodehub/opencodehub)
[![Docker Pulls](https://img.shields.io/docker/pulls/opencodehub/opencodehub?style=flat-square&color=emerald)](https://hub.docker.com/r/opencodehub/opencodehub)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/Docs-docs.opencodehub.space-indigo?style=flat-square)](https://docs.opencodehub.space)

**The self-hosted Git platform built for speed, control, and modern software engineering workflows.**

OpenCodeHub is an open-source alternative to GitHub/GitLab featuring native Graphite-style **Stacked PRs**, a **Merge Queue with speculative builds**, a **GitHub Actions-compatible CI/CD engine**, and multi-provider **AI Code Review**.

---

## Key Features

- 🥞 **Stacked PRs** — Native stacked branch workflows in Web UI & CLI (`och stack create/submit/sync`)
- 🚦 **Merge Queue** — Priority lanes, speculatively tested builds, and auto-merge controls
- ⚡ **CI/CD Pipeline Engine** — GitHub Actions workflow runner using Docker-in-Docker execution
- 🤖 **AI Code Review** — Multi-provider support (OpenAI, Anthropic, Gemini, Groq, local Ollama)
- 🔒 **Enterprise Security** — Secret scanning, Trivy vulnerability scans, license compliance, OIDC SSO, 2FA/TOTP, and path permissions
- 📦 **Pluggable Storage** — Local filesystem, AWS S3, Cloudflare R2, MinIO, Ceph, Garage, and any S3-compatible backend
- 🗄️ **Multi-Database Support** — PostgreSQL (recommended for production), SQLite, and Turso/LibSQL
- 🧰 **Developer CLI** — `opencodehub-cli` (`och`) with interactive terminal cockpit (`och focus`) and stack visualization

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                              │
│  Browser  │  Git CLI (HTTP/SSH)  │  OpenCodeHub CLI (och)   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    OPENCODEHUB PLATFORM                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Web UI     │  │  REST API   │  │  GraphQL Endpoint   │  │
│  │  (Astro+React)││  (140+ routes)││  (src/pages/api/)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Git Server │  │  SSH Server │  │  Pipeline Runner    │  │
│  │  (HTTP RPC) │  │  (ssh2)     │  │  (Docker executor)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              PERSISTENCE & INFRASTRUCTURE                   │
│  PostgreSQL / SQLite  │  Redis  │  S3 / MinIO / Local       │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Single Container (Quick Test)

```bash
docker run -d \
  --name opencodehub \
  -p 4321:4321 \
  -p 2222:2222 \
  -v opencodehub-data:/data \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e INTERNAL_HOOK_SECRET=$(openssl rand -hex 32) \
  -e SITE_URL=http://localhost:4321 \
  opencodehub/opencodehub:latest
```

Open **http://localhost:4321** in your browser to get started.

---

### 2. Production Docker Compose Stack (Recommended)

```yaml
version: "3.8"

services:
  app:
    image: opencodehub/opencodehub:latest
    container_name: opencodehub-app
    restart: always
    ports:
      - "4321:4321"   # Web UI & API
      - "2222:2222"   # Git SSH Server
    environment:
      - NODE_ENV=production
      - SITE_URL=https://git.yourdomain.com
      - DATABASE_DRIVER=postgres
      - DATABASE_URL=postgresql://opencodehub:secretpass@postgres:5432/opencodehub?sslmode=disable
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - SESSION_SECRET=${SESSION_SECRET}
      - INTERNAL_HOOK_SECRET=${INTERNAL_HOOK_SECRET}
      - RUNNER_SECRET=${RUNNER_SECRET}
      - WORKFLOW_SECRET_ENCRYPTION_KEY=${WORKFLOW_SECRET_ENCRYPTION_KEY}
    volumes:
      - app-data:/data
    depends_on:
      - postgres
      - redis

  worker:
    image: opencodehub/opencodehub-worker:latest
    container_name: opencodehub-worker
    restart: always
    environment:
      - NODE_ENV=production
      - DATABASE_DRIVER=postgres
      - DATABASE_URL=postgresql://opencodehub:secretpass@postgres:5432/opencodehub?sslmode=disable
      - REDIS_URL=redis://redis:6379
    volumes:
      - app-data:/data
    depends_on:
      - postgres
      - redis

  runner:
    image: opencodehub/opencodehub-runner:latest
    container_name: opencodehub-runner
    restart: always
    privileged: true
    environment:
      - OPENCODEHUB_URL=http://app:4321
      - RUNNER_SECRET=${RUNNER_SECRET}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - app

  postgres:
    image: postgres:16-alpine
    container_name: opencodehub-postgres
    restart: always
    environment:
      POSTGRES_USER: opencodehub
      POSTGRES_PASSWORD: secretpass
      POSTGRES_DB: opencodehub
    volumes:
      - pg-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: opencodehub-redis
    restart: always
    volumes:
      - redis-data:/data

volumes:
  app-data:
  pg-data:
  redis-data:
```

Start the stack:
```bash
docker compose up -d
docker compose exec app bun run scripts/seed-admin.ts
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SITE_URL` | Yes | `http://localhost:4321` | Base URL of your platform (e.g. `https://git.company.com`) |
| `DATABASE_DRIVER` | No | `postgres` | Database driver (`postgres`, `sqlite`, `turso`) |
| `DATABASE_URL` | Yes | — | Connection string (PostgreSQL/SQLite) |
| `REDIS_URL` | Yes | — | Redis connection URI for sessions & locks |
| `JWT_SECRET` | Yes | — | 32+ char secret for JWT token signing |
| `SESSION_SECRET` | Yes | — | 32+ char secret for cookie encryption |
| `INTERNAL_HOOK_SECRET` | Yes | — | Shared secret for Git hook callbacks |
| `STORAGE_TYPE` | No | `local` | Storage backend (`local` or `s3`) |
| `STORAGE_BUCKET` | If `STORAGE_TYPE=s3` | — | S3 bucket name |
| `STORAGE_REGION` | If `STORAGE_TYPE=s3` | `us-east-1` | S3 region |
| `STORAGE_ENDPOINT` | Optional | — | S3-compatible custom endpoint (MinIO / R2 / Garage) |
| `STORAGE_ACCESS_KEY_ID` | If `STORAGE_TYPE=s3` | — | Access Key ID |
| `STORAGE_SECRET_ACCESS_KEY` | If `STORAGE_TYPE=s3` | — | Secret Access Key |
| `METRICS_TOKEN` | Optional | — | Bearer token for `GET /api/metrics` |

---

## OpenCodeHub CLI (`och`)

Install the official CLI to manage stacks, merge queues, and reviews:

```bash
npm install -g opencodehub-cli

# Authenticate with your self-hosted instance
och auth login --url https://git.yourdomain.com

# Create stacked PR branches
och stack create feature/part-1
och stack submit
```

---

## Useful Links & Community

- **Official Repository**: [github.com/swadhinbiswas/OpencodeHub](https://github.com/swadhinbiswas/OpencodeHub)
- **Documentation**: [docs.opencodehub.space](https://docs.opencodehub.space)
- **Bug Tracker**: [github.com/swadhinbiswas/OpencodeHub/issues](https://github.com/swadhinbiswas/OpencodeHub/issues)
- **License**: MIT
