---
title: "Self‑Hosted with Docker + Nginx"
description: "Deploy OpenCodeHub behind a reverse proxy with HTTPS."
---

This tutorial combines the Docker deployment guide with an Nginx reverse proxy setup.

## 1) Start services with Docker

```bash
cp .env.example .env
# Edit .env with production values

docker-compose up -d
```

## 2) Configure Nginx

Follow the [administration/deploy-nginx](../administration/deploy-nginx) guide to configure TLS termination and proxy rules.

## 3) Seed admin user

```bash
docker-compose exec app bun run scripts/seed-admin.ts
```

## 4) Validate

- Open your instance URL
- Create a repository
- Test `git clone` over HTTP or SSH

## Tips

- Enable `ENABLE_ACTIONS=true` if you plan to run workflows.
- Set `RUNNER_ENABLED=true` and bind the Docker socket for runners.
