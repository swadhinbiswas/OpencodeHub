# OpenCodeHub Production Readiness Gap Analysis
Date: 2026-02-20
Scope: current repository state (`src/`, `tests/`, CI workflow, deployment docs)

## 1. Executive Assessment
OpenCodeHub is feature-rich and close to production-capable for self-hosted teams, but it is not yet at "predictable production software" maturity.

Estimated readiness: **72/100**
Estimated gap to production-grade target: **28/100**

This means: core capabilities are present, but release reliability, operational rigor, and quality governance still need hardening.

## 2. Philosophy Alignment (What "Production" Means Here)
OpenCodeHub philosophy from code/docs context:
- Self-hosted first (control, data residency, deploy-anywhere)
- Developer velocity first (fast workflows, stacked PRs, automation)
- Secure-by-default pragmatism (authn/authz, rate limits, guardrails)

For this philosophy, production-grade means:
- Teams can upgrade safely and repeatedly
- Incidents are observable and recoverable
- Security controls are enforceable, not only available
- Quality gates are green by default (not bypassed by drift)

## 3. Evidence Snapshot (Measured Today)
### Codebase size and test surface
- API route files: **211** (`src/pages/api`)
- Test files: **86** total
- Unit tests: **31**
- Integration tests: **50**
- E2E tests (Playwright): present in `tests/e2e/*` but not part of CI workflow

### Quality gate status
- `npm run typecheck`: **PASS**
- `npm run lint` (`astro check`): **FAIL**
  - Reported summary: **40 errors**, **493 hints**
- `npm run test`: **FAIL**
  - **3 failing tests** out of **279**
  - Failing suites:
    - `tests/unit/notifications-route.test.ts`
    - `tests/unit/notifications-blocking-summary-route.test.ts`

### Debt indicators
- `TODO/FIXME/HACK/XXX`: **2** (low explicit TODO debt)
- `@ts-expect-error`: **114** (high type-safety bypass debt)
- Explicit `any` in `src`/`cli`: **487** (high typing debt)

### CI/CD and security gating
Current CI (`.github/workflows/ci.yml`) includes:
- lint, typecheck, docs parity, dependency audit, tests, build, docker build/push

Notably missing as enforced gates:
- SAST/CodeQL-style static security analysis
- secret-scanning gate for commits/PRs
- mandatory e2e execution gate
- policy-based release quality thresholds (for example: max failing tests = 0, max lint errors = 0 already implied but currently failing baseline)

## 4. Readiness Scorecard
| Domain | Weight | Current | Target | Gap | Notes |
|---|---:|---:|---:|---:|---|
| Feature breadth | 15 | 14 | 15 | 1 | Major platform capabilities implemented and documented. |
| Security controls | 20 | 15 | 20 | 5 | Strong controls exist; enforcement/testing coverage still uneven. |
| Release quality gates | 20 | 11 | 20 | 9 | Lint and full test suite are not green on current branch. |
| Reliability & operability | 20 | 13 | 20 | 7 | Health and scaling checks improved; SLO/runbook/incident maturity partial. |
| Scalability & performance confidence | 15 | 10 | 15 | 5 | Redis/distributed locks in place; limited systematic load/perf validation. |
| Compliance & auditability posture | 10 | 9 | 10 | 1 | Audit/policy features are strong; formalized operational controls can improve. |
| **Total** | **100** | **72** | **100** | **28** | |

## 5. Primary Production Blockers
### P0 (must fix before production claim)
1. **Green baseline required**
   - Resolve current lint failure (`40 errors`).
   - Resolve current unit-test failures (3 failing tests).
2. **Lock release quality baseline**
   - Enforce "no known red" on `main` as policy.
   - Add branch protections tied to mandatory CI success.

### P1 (critical hardening next)
1. **Type-safety debt reduction**
   - Burn down `@ts-expect-error` and high-risk `any` usage in core API/security paths.
2. **Operational maturity**
   - Define SLOs (availability, API latency, queue lag).
   - Add incident runbooks and DR drills with RPO/RTO targets.
3. **Security pipeline depth**
   - Add static analysis + secret scanning gates to CI.

### P2 (confidence multipliers)
1. Add required e2e smoke gate for auth/repo/PR/merge critical paths.
2. Add repeatable load/performance test suite and regression thresholds.
3. Publish production compatibility matrix (single-node, HA, air-gapped, object storage modes).

## 6. 30/60/90 Day Plan (Philosophy-Aligned)
### 0-30 days: Stabilize release truth
- Make lint/test/typecheck green on `main` and keep it green.
- Fix notifications test regressions and add route contract tests for critical APIs.
- Add CI badge/metric report in docs with objective pass/fail status.

### 31-60 days: Operationalize reliability
- Define and document SLOs + alert thresholds.
- Add on-call runbook and incident templates (self-hosted friendly).
- Add backup/restore verification job (restore drills, not backup-only).

### 61-90 days: Harden trust and scale confidence
- Add security static analysis and secret-scanning CI gates.
- Add e2e critical flow gate (Playwright) in CI.
- Add load test scenarios for PR merge queue, webhook ingest, and notifications.

## 7. Exit Criteria for "Production-Grade" Claim
Only claim production-grade when all are true for a sustained period (for example 4 consecutive weeks):
1. `lint`, `typecheck`, full `test`, and e2e smoke all green on protected branch.
2. No P0 defects open.
3. SLOs defined, monitored, and alerting live.
4. Backup **and restore** drills pass on schedule.
5. Security gates (dependency audit + SAST + secret scan) enforced in CI.

## 8. Bottom Line
OpenCodeHub is **not far** from production-grade for its self-hosted philosophy, but it is not there yet.

Most of the remaining gap is not missing features; it is **software operations discipline**:
- green baseline,
- stronger quality/security gates,
- and repeatable reliability evidence.

That is a tractable 1-2 quarter hardening effort, not a multi-year rebuild.
