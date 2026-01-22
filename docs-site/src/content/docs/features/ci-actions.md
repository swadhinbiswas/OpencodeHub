---
title: "CI/CD Actions"
description: "GitHub Actions–compatible workflows and self‑hosted runners."
---

OpenCodeHub supports GitHub Actions–style workflows defined in `.github/workflows/*.yml`.

## Example workflow

```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm test
```

## View runs

- Global runs: `/actions`
- Repo runs: `/owner/repo/actions`

## Runner settings

Set these environment flags to enable runners:

```bash
RUNNER_ENABLED=true
RUNNER_DOCKER_SOCKET=/var/run/docker.sock
RUNNER_CONCURRENT_JOBS=2
RUNNER_TIMEOUT=3600
```

And ensure actions are enabled:

```bash
ENABLE_ACTIONS=true
```

## CLI workflows

```bash
och ci list --branch main
och ci view <run-id> --jobs
och ci trace <job-id> --follow
```
