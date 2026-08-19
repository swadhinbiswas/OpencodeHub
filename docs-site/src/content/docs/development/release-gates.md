---
title: "Release Gates"
---

# Release Gates

This document outlines the required gates that must be passed before any code can be merged into the default branch.

## 1. Continuous Integration (CI)
All pull requests must pass the following CI checks:
- **Linting**: `npm run lint` must exit with 0.
- **Typechecking**: `npm run typecheck` must exit with 0.
- **Tests**: Unit, integration, and E2E tests (`npm run test`) must all pass.

## 2. Security Scans
- **Secret Scanning**: Commits must be scanned for leaked secrets.
- **Dependency Audit**: `npm audit` must not report vulnerabilities above the defined threshold.
- **Authorization Regression**: Core RBAC and permissions tests must pass.

## 3. Documentation Parity
Any feature addition must include updates to both documentation stacks:
- The Markdown docs in `docs/`
- The Starlight site in `docs-site/src/content/docs/`

Features will not be merged if their documentation is missing or incomplete.
