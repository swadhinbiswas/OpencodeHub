# CI/CD Pipelines

> GitHub Actions-compatible continuous integration and deployment

OpenCodeHub includes a built-in CI/CD pipeline engine that reads workflow definitions from `.github/workflows/*.yml` files in your repository. It supports Docker-based job execution, matrix builds, caching, and secrets management.

---

## Overview

### Supported Features

- **GitHub Actions-compatible syntax** — Use familiar `jobs`, `steps`, `runs-on`, and `uses`
- **Docker-based execution** — Every job runs in an isolated container
- **Matrix builds** — Test across multiple versions, OS images, or configurations
- **Secrets management** — Encrypted repository and organization secrets
- **Artifact storage** — Upload and download build artifacts
- **Caching** — Cache dependencies between runs
- **Self-hosted runners** — Run jobs on your own infrastructure
- **Pipeline status checks** — Block PR merge until CI passes

---

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

      - name: Run linter
        run: npm run lint
```

### 2. Push and Watch

Push the file to OpenCodeHub:

```bash
git add .github/workflows/ci.yml
git commit -m "Add CI workflow"
git push origin main
```

OpenCodeHub automatically detects the workflow and triggers a run. View results in:
- Repository → Actions tab
- Pull request status checks

---

## Workflow Syntax

### Triggers (`on`)

```yaml
on:
  push:
    branches: [main, develop]
    paths:
      - 'src/**'
      - '!src/**/*.test.ts'

  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday

  workflow_dispatch:  # Manual trigger
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'staging'
```

### Jobs

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build

  test:
    needs: build
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
```

### Secrets

Reference secrets in workflows:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: ./deploy.sh
        env:
          API_KEY: ${{ secrets.API_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Configure secrets in:
- Repository → Settings → Secrets
- Organization → Settings → Secrets (shared across repos)

---

## Runner Configuration

### In-App Runner

The simplest option — runs inside the main OpenCodeHub process:

```bash
npm run runner:start
```

### Docker Runner (Recommended)

Run the standalone CI runner in a Docker container:

```yaml
# docker-compose.yml
services:
  runner:
    build:
      context: .
      dockerfile: Dockerfile.runner
    privileged: true  # Required for Docker-in-Docker
    environment:
      SERVER_URL: https://git.yourcompany.com
      RUNNER_TOKEN: <from-admin-panel>
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

### Multiple Runners

Scale by running multiple runner containers:

```bash
docker-compose up -d --scale runner=3
```

---

## Pipeline States

| State | Description |
|-------|-------------|
| `queued` | Waiting for a runner |
| `in_progress` | Currently executing |
| `success` | All jobs completed successfully |
| `failure` | One or more jobs failed |
| `cancelled` | Manually cancelled or superseded |
| `skipped` | Trigger conditions not met |

---

## Artifact Management

Upload artifacts from jobs:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: dist/
```

Download in downstream jobs:

```yaml
jobs:
  deploy:
    needs: build
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: build-output
      - run: ./deploy.sh
```

Artifacts are stored via the configured storage adapter (S3, GCS, local, etc.).

---

## Caching

Cache dependencies to speed up builds:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-
      - run: npm ci
```

Cache storage uses the same storage adapter as artifacts.

---

## Status Checks & Branch Protection

Require CI to pass before merging:

1. Go to Repository → Settings → Branches
2. Add protection rule for `main`
3. Enable **Require status checks to pass**
4. Select your workflow name (e.g., `CI / test`)

Now PRs cannot be merged until the pipeline succeeds.

---

## Monitoring Pipeline Runs

### Web UI

Repository → Actions shows:
- Run history with status
- Step-by-step logs
- Duration and resource usage
- Artifact downloads

### CLI

```bash
# List recent runs
och actions list

# View logs
och actions logs <run-id>

# Cancel a run
och actions cancel <run-id>

# Rerun failed jobs
och actions rerun <run-id>
```

### API

```bash
# List workflow runs
curl https://git.yourcompany.com/api/repos/owner/repo/actions/runs \
  -H "Authorization: Bearer $TOKEN"

# Get run details
curl https://git.yourcompany.com/api/repos/owner/repo/actions/runs/42 \
  -H "Authorization: Bearer $TOKEN"
```

---

## Best Practices

### Fast Feedback

- Run lint and unit tests first (fast)
- Run integration and E2E tests after (slower)
- Use job dependencies (`needs`) to parallelize

### Security

- Never commit secrets to git
- Use repository secrets for sensitive values
- Review workflow files from forks before running

### Cost Optimization

- Use caching for dependencies
- Cancel redundant runs on new pushes
- Use `paths` filters to avoid unnecessary builds

---

## Troubleshooting

### "No runner available"

Start a runner or check runner registration:
```bash
# Check runner status
curl https://git.yourcompany.com/api/admin/runners \
  -H "Authorization: Bearer $TOKEN"
```

### "Docker not found"

The runner requires Docker. Ensure:
- Docker is installed
- Runner has `--privileged` flag (for Docker-in-Docker)
- `/var/run/docker.sock` is mounted (for host Docker)

### "Step failed but should pass"

Check:
- Environment variables are set correctly
- Secrets are configured in repository settings
- File paths are correct (repo root is the working directory)

---

## See Also

- [Stacked Pull Requests](stacked-prs.md)
- [Smart Merge Queue](merge-queue.md)
- [Storage Adapters](../guides/storage-adapters.md)
