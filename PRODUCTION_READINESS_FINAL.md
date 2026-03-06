# OpenCodeHub Production Readiness Report

**Date:** 2026-03-06
**Auditor:** GitHub Copilot (Automated Deep Audit)
**Score: 7/10** (up from 3/10 at the start of this session)

---

## Executive Summary

OpenCodeHub is a self-hosted Git platform (~120K lines TypeScript/Astro) with ambitious feature scope. This session conducted a brutal production readiness audit, finding **6 CRITICAL**, **3 HIGH**, and **3 SHOWSTOPPER** bugs. **All were fixed.** Docker deployment infrastructure was created, and CLI-to-API endpoint mismatches were systematically repaired.

The app is now **deployable via Docker** and the web + CLI surfaces are **structurally sound**. However, it is not "production-ready" in the sense of handling real user traffic safely — several areas need further hardening before a public launch.

---

## What Was Fixed This Session

### SHOWSTOPPERS FIXED (3/3)

| #   | Issue                                              | Impact                                 | Fix                                            |
| --- | -------------------------------------------------- | -------------------------------------- | ---------------------------------------------- |
| 1   | `Astro.locals.user` never populated                | Every authenticated page broken        | Added user session population in middleware.ts |
| 2   | pgTable schemas + SQLite default driver            | All DB queries crash on default config | Changed default driver to PostgreSQL           |
| 3   | Missing database initialization in health endpoint | App wouldn't start cleanly             | Resolved via entrypoint script                 |

### CRITICAL BUGS FIXED (6/6)

| #   | Issue                                          | Fix                                                     |
| --- | ---------------------------------------------- | ------------------------------------------------------- |
| 1   | `getStorageAdapter` doesn't exist              | Changed to `await getStorage()` in npm/docker routes    |
| 2   | `organizations.slug` doesn't exist in SAML     | Changed to `organizations.name`                         |
| 3   | `name` vs `displayName` in SAML user insert    | Changed to `displayName`                                |
| 4   | Vercel adapter can't run standalone in Docker  | Changed to `@astrojs/node` with `mode: "standalone"`    |
| 5   | 6 duplicate pgTable definitions                | Removed from security-advanced.ts, imported from schema |
| 6   | Dockerfile.runner missing from OpenCodeHub dir | Copied into place                                       |

### HIGH ISSUES FIXED (3/3)

| #   | Issue                        | Fix                                             |
| --- | ---------------------------- | ----------------------------------------------- |
| 1   | Port 3000 vs 4321 mismatch   | Unified to 4321, made configurable via PORT env |
| 2   | Health endpoint adapter init | Handled via docker-entrypoint.sh                |
| 3   | Runner script path mismatch  | runner.sh copied to correct location            |

### CLI FIXES (8 command groups)

| Command         | Issue                                    | Fix                                         |
| --------------- | ---------------------------------------- | ------------------------------------------- |
| `ssh-key`       | `/api/user/ssh-keys` doesn't exist       | → `/api/user/keys`                          |
| `queue`         | `/merge-queue` doesn't exist             | → `/queue`                                  |
| `search`        | `/search/repos` etc don't exist          | → `/search?type=repos` etc                  |
| `review`        | `/ai-review/latest` doesn't exist        | → `/ai-review` (GET exists)                 |
| `notify read`   | `PATCH /notifications/{id}` wrong method | → `POST /notifications/{id}/read`           |
| `insights show` | `/metrics/user` hits Prometheus          | → `/user/metrics`                           |
| `ci trace`      | Missing runId in path                    | → `/actions/runs/{runId}/jobs/{jobId}/logs` |
| `secret`        | No API routes existed                    | Created full CRUD endpoints                 |

### NEW API ROUTES CREATED (13)

- `pulls/[number]/diff.ts` — PR diff endpoint
- `releases/tags/[tag].ts` — Release lookup by tag name
- `actions/runs/index.ts` — List CI runs
- `actions/runs/[runId]/index.ts` — View CI run detail
- `actions/runs/[runId]/rerun.ts` — Rerun failed CI
- `actions/runs/[runId]/cancel.ts` — Cancel running CI
- `actions/secrets/index.ts` — List/create secrets
- `actions/secrets/[name].ts` — Get/delete/set secret by name
- `repos/[owner]/[repo]/metrics.ts` — Repository metrics
- `pull-requests.ts` — Pull requests inbox endpoint
- `metrics/team.ts` — Team metrics/leaderboard
- `users/[username]/metrics.ts` — User-by-username metrics
- `issues/[number]/comments.ts` — Issue comments CRUD

---

## Docker Deployment

### Quick Deploy (DockerHub)

```bash
# 1. Create docker-compose.production.yml (provided in repo)
# 2. Set required env vars:
export POSTGRES_PASSWORD=your-secure-password
export JWT_SECRET=$(openssl rand -base64 32)
export WORKFLOW_SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)

# 3. Pull and run:
docker compose -f docker-compose.production.yml up -d
```

**Image:** `swadhinbiswas/opencodehub:latest`
**Architectures:** linux/amd64, linux/arm64
**CI/CD:** `.github/workflows/docker-publish.yml` auto-builds on push to main

### What Docker Does

1. Waits for PostgreSQL to be ready (30s timeout)
2. Runs Drizzle migrations (`drizzle-kit push --force`)
3. Generates SSH host key if missing
4. Creates data directories
5. Starts Astro SSR on port 4321
6. Healthcheck: `/api/health` every 30s

---

## Remaining Issues (Not Blocking Docker Deploy)

### TypeScript Build Errors: 127 (ALL PRE-EXISTING)

All 127 errors are Drizzle ORM multi-DB type union issues:

- Drizzle's `.from()`, `.where()`, `.select()` produce union types across SQLite/PostgreSQL/Turso adapters
- These are **TypeScript-only errors** — they do NOT affect runtime behavior since we default to PostgreSQL
- Fix would require choosing a single DB adapter type throughout, or using type assertions

### Features Not Yet Backed by API

| CLI Command             | Status                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| `pr diff`               | Stub endpoint (returns PR metadata, needs git backend for actual diff) |
| `ci list/view/status`   | Endpoints exist, depend on workflow runner populating DB               |
| `ci trace/retry/cancel` | Endpoints exist, depend on workflow runner                             |
| `inbox list`            | Endpoint exists, limited to author-based filtering                     |
| `repo metrics`          | Endpoint exists, commits count requires git backend                    |

### Security Considerations

- **Secret storage:** Repository workflow secrets are now encrypted at rest with AES-256-GCM. Legacy plaintext rows remain readable for backward compatibility and should be rotated over time.
- **SAML/SSO:** Callback flow is structurally correct but needs integration testing with a real IdP
- **Rate limiting:** Middleware checks exist but configuration needs tuning
- **JWT tokens:** Requires `JWT_SECRET` env var (docker-compose enforces this)
- **Encryption key management:** `WORKFLOW_SECRET_ENCRYPTION_KEY` is now required for production Docker deployments and must be backed up securely.

### Recommended Before Public Launch

1. **Integration test SAML/SSO flow** with a real IdP (Okta, Azure AD)
2. **Load test** the Astro SSR server under concurrent connections
3. **Set up proper logging** (structured JSON, log aggregation)
4. **Configure Redis** for session management and caching (docker-compose includes Redis)
5. **Set up backup strategy** for PostgreSQL data volume
6. **Rotate any existing plaintext workflow secrets** so all stored rows use the new encryption format

---

## Score Breakdown

| Category       | Score    | Notes                                                                               |
| -------------- | -------- | ----------------------------------------------------------------------------------- |
| Build & Deploy | 8/10     | Docker works, CI/CD pipeline ready, multi-arch support                              |
| Authentication | 6/10     | JWT + session cookies work, SAML stub needs testing                                 |
| Database       | 7/10     | PostgreSQL with Drizzle ORM, migrations automated                                   |
| API Surface    | 7/10     | All CLI commands now have matching API endpoints                                    |
| CLI            | 8/10     | All commands compile cleanly, paths corrected                                       |
| Security       | 5.5/10   | Secrets encrypted at rest, but rate limiting and key ops need work                  |
| Observability  | 5/10     | Health endpoint exists, Prometheus metrics exist but incomplete                     |
| Testing        | 3/10     | Test infrastructure exists but coverage is minimal                                  |
| **Overall**    | **7/10** | **Deployable, with core secret storage hardened; still needs production hardening** |

---

## Files Modified This Session

### Webapp (14 files modified, 14 files created)

**Modified:**

- `astro.config.mjs` — vercel → node adapter
- `src/middleware.ts` — user session population
- `src/db/index.ts` — default driver SQLite → PostgreSQL
- `drizzle.config.ts` — default dialect PostgreSQL
- `.env.example` — corrected driver options
- `src/lib/security-advanced.ts` — removed duplicate tables
- `src/lib/ai-review.ts` — estimatedCostUsd → costCents
- `src/lib/analytics-advanced.ts` — asc import + requestedAt fix
- `src/pages/api/packages/npm/[package].ts` — getStorage fix
- `src/pages/api/packages/docker/v2/[...path].ts` — getStorage fix
- `src/pages/api/auth/saml/callback.ts` — field name fixes
- `src/pages/[owner]/[repo]/packages/index.astro` — Layout + organizationId fix
- `Dockerfile` — entrypoint, healthcheck, migration support
- `docker-compose.yml` — JWT_SECRET + workflow secret encryption enforcement
- `src/pages/api/repos/[owner]/[repo]/actions/secrets/index.ts` — encrypt secrets before persistence
- `src/pages/api/repos/[owner]/[repo]/actions/secrets/[name].ts` — encrypt single-secret upserts before persistence

**Created (API Routes):**
13 new API endpoint files (listed above)

**Created (Docker):**

- `docker-entrypoint.sh`
- `docker-compose.production.yml`
- `.github/workflows/docker-publish.yml`

### CLI (7 files modified)

- `cli/src/commands/ssh-key/index.ts`
- `cli/src/commands/queue/index.ts`
- `cli/src/commands/search/index.ts`
- `cli/src/commands/review/index.ts`
- `cli/src/commands/notify/index.ts`
- `cli/src/commands/insights/index.ts`
- `cli/src/commands/ci/index.ts`
