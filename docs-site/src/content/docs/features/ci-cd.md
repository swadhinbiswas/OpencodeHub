---
title: "CI/CD Pipelines"
---

OpenCodeHub includes a built-in CI/CD pipeline engine that reads workflow definitions from `.github/workflows/*.yml` files in your repository.

## Supported Features

- **GitHub Actions-compatible syntax** — familiar `jobs`, `steps`, `runs-on`, and `uses`
- **Docker-based execution** — every job runs in an isolated container
- **Matrix builds** — test across multiple versions or configurations
- **Secrets management** — encrypted repository and organization secrets
- **Artifact storage** — upload and download build artifacts
- **Caching** — cache dependencies between runs
- **Self-hosted runners** — run jobs on your own infrastructure

## Quick Start

### 1. Create a Workflow File

Add `.github/workflows/ci.yml` to your repository:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
```

### 2. Push and Watch

Push the file to OpenCodeHub. The workflow is automatically detected and a run is triggered.

## Runner Configuration

### In-App Runner

```bash
npm run runner:start
```

### Docker Runner (Recommended)

```yaml
services:
  runner:
    build:
      context: .
      dockerfile: Dockerfile.runner
    privileged: true
    environment:
      SERVER_URL: https://git.yourcompany.com
      RUNNER_TOKEN: <from-admin-panel>
```

## Status Checks & Branch Protection

Require CI to pass before merging:

1. Go to Repository → Settings → Branches
2. Add protection rule for `main`
3. Enable **Require status checks to pass**
4. Select your workflow name

## Monitoring Pipeline Runs

### Web UI

Repository → Actions shows run history, step-by-step logs, and artifacts.

### CLI

```bash
och actions list
och actions logs <run-id>
och actions cancel <run-id>
```

### API

```bash
curl https://git.yourcompany.com/api/repos/owner/repo/actions/runs \
  -H "Authorization: Bearer $TOKEN"
```

## Best Practices

- Run lint and unit tests first (fast), integration tests after (slower)
- Use caching for dependencies
- Cancel redundant runs on new pushes
- Use `paths` filters to avoid unnecessary builds
