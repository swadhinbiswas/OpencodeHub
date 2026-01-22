---
title: "Testing & CI"
description: "Run tests locally and understand the pipeline model."
---

## Test commands

```bash
npm run test
npm run test:coverage
```

## Type checking & lint

```bash
npm run typecheck
npm run lint
```

## CI pipelines

OpenCodeHub supports GitHub Actions–compatible workflows under `.github/workflows/`. Use the Actions UI to inspect runs and view logs.

For CLI access:

```bash
och ci list
och ci view <run-id> --jobs
```
