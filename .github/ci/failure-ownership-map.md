# CI Failure Ownership Map

Last updated: 2026-04-01

This map defines who owns failing checks and the expected response SLA.

## SLA Policy

- P0 (main branch red / release blocker): acknowledge within 30 minutes, mitigation within 4 hours.
- P1 (non-blocking lane degraded): acknowledge within 4 hours, fix within 1 business day.
- P2 (low-risk flaky/non-critical): acknowledge within 1 business day, fix within 5 business days.

## Lane Ownership

| Lane / Check                          | Scope                          | Primary Owner    | Secondary Owner  | Priority Class |
| ------------------------------------- | ------------------------------ | ---------------- | ---------------- | -------------- |
| Lint & Type Check                     | static quality gates           | Core API owner   | QA/Release owner | P0             |
| Docs Parity                           | docs-to-implementation parity  | QA/Release owner | Core API owner   | P1             |
| Security Gates                        | dependency/security audit gate | Security owner   | Platform owner   | P0             |
| Unit Tests (Lane: unit)               | pure unit tests                | Core API owner   | QA/Release owner | P0             |
| Integration Tests (Lane: integration) | route/service integration      | Core API owner   | Platform owner   | P0             |
| Contract Tests (Lane: contract)       | OpenAPI + contract parity      | Core API owner   | QA/Release owner | P0             |
| Smoke Tests (Lane: smoke)             | critical user flows            | QA/Release owner | Core API owner   | P0             |
| E2E Tests (Playwright)                | browser workflow checks        | QA/Release owner | Core API owner   | P1             |
| Container Security (Trivy)            | image vulnerability checks     | Security owner   | Platform owner   | P0             |
| SAST (Semgrep)                        | static appsec scan             | Security owner   | Core API owner   | P1             |
| Secret Scan (Gitleaks)                | repository secret detection    | Security owner   | Platform owner   | P0             |
| Build                                 | production build validation    | Platform owner   | Core API owner   | P0             |
| Performance Baseline                  | release latency regression     | Platform owner   | QA/Release owner | P1             |

## Domain Ownership

| Domain                   | File Patterns                                             | Owner            | SLA |
| ------------------------ | --------------------------------------------------------- | ---------------- | --- |
| Auth & Sessions          | src/pages/api/auth/\*\*, src/lib/auth.ts                  | Core API owner   | P0  |
| Repo/PR/Issue APIs       | src/pages/api/repos/\*\*                                  | Core API owner   | P0  |
| Permissions/RBAC         | src/lib/permissions.ts, src/pages/api/orgs/\*\*           | Core API owner   | P0  |
| Queue/Worker/Runner      | src/lib/merge-queue.ts, src/lib/queue-\*, src/runner/\*\* | Platform owner   | P0  |
| Data/DB/Migrations       | src/db/**, drizzle/**                                     | Platform owner   | P0  |
| Security Controls        | src/middleware/\*_, src/lib/security_                     | Security owner   | P0  |
| Observability/Operations | scripts/**, docs/administration/**                        | Platform owner   | P1  |
| OpenAPI/Contracts        | src/lib/openapi.ts, tests/unit/openapi-\*                 | QA/Release owner | P0  |

## Escalation

1. Failing required check on `main` → assign primary owner immediately.
2. No mitigation in SLA window → escalate to secondary owner.
3. Repeated failures in same lane (3 times in 7 days) → open reliability incident and add remediation item to production board.
