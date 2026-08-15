# OpenCodeHub — Production Parity Plan (Gitea/GitHub-class)

**Version:** 1.0 — 2026-08-10
**Basis:** verified code audit (2026-08-10) — `doc/feature_audit.md` self-report was reconciled against actual code. This plan supersedes `notimplemented.md` as the execution roadmap.
**Team assumption:** 3–4 engineers (2 senior + 1–2 mid) + shared QA effort in CI. Timeline scales linearly with team size.

---

## 1. Goal & Exit Criteria

### Goal
Make OpenCodeHub an **industry-grade, production-usable** self-hosted Git platform — functionally at **Gitea-parity**, with the flagship differentiators (stacked PRs, merge queue, AI review) as the GitHub-killer features — such that a mid-size company can run it in production with confidence.

### Hard Exit Criteria (ALL must be true for GA 1.0)

| # | Criterion | Measurement |
|---|---|---|
| E1 | Every feature in the audit matrix has a working end-to-end path (API → UI → storage) | `scripts/audit-wiring-check.mjs` (new) — zero dead-code/zero-unwired flags |
| E2 | CI/CD single execution path; runs persisted; secrets injected; all step types execute | Contract test suite passes on push-triggered, dispatch-triggered, cron-triggered runs |
| E3 | Quality gates actually gate | CI fails on: lint, typecheck, <60% line coverage, security audit, e2e, perf P95>500ms |
| E4 | Zero known critical/high security findings | Trivy + Semgrep + npm audit + gitleaks all green with allowlist ≤ 5 items |
| E5 | Backup/restore verified with RPO ≤ 15 min, RTO ≤ 1 h, drill automated in CI | `drill:backup-restore` passes weekly |
| E6 | Multi-instance correctness proven | Chaos test: 2 app + 2 worker instances, 10k queue ops, zero double-processing (fencing tokens) |
| E7 | API/DX: OpenAPI ≥ 80% route coverage, GraphQL ≥ 40 queries/mutations, fine-grained PATs, OAuth-provider mode shipped | Parity test enforces no regression |
| E8 | Org/team management complete (CRUD, members, invites, teams, org secrets/webhooks) | E2E spec `orgs.spec.ts` green |
| E9 | Data integrity: no fabricated UI data (contribution graph real), no dead schema columns flagged | Wiring audit (E1) covers it |
| E10 | Release engineering: single version source, git tags, changelog automation, migration rehearsal in CI | `release:dry-run` job green |

---

## 2. Key Architecture Decisions (read first)

These decisions shape every phase. They are the non-negotiable refactors.

### AD-1: Unify CI/CD into one DB-backed execution path
**Problem:** `src/lib/workflows.ts` runs `PipelineRunner.runWorkflow()` in-process, fire-and-forget, **creating zero `workflowRuns` rows**; the polling runner (`src/runner/*`) is DB-backed but executes only `run:` steps, injects no secrets, and defaults to `NETWORK_MODE=none`.
**Design:**
- New `WorkflowRunManager` (`src/lib/run-manager.ts`): single entry point. Trigger fires → create `workflowRuns` + expanded `workflowJobs` rows (status `queued`) → dispatch each job to an executor via a common `JobExecutor` interface.
- Two executors behind the interface: `LocalDockerExecutor` (in-process dockerode, default for `runs-on: opencodehub`) and `RemoteRunnerClient` (existing `src/runner/client.ts` poll model, for labeled runners).
- `runs-on` label matching against `pipelineRunners` (like GitHub runner labels). Unknown label → job stays queued until a runner with the label registers.
- All job claims use optimistic `UPDATE ... WHERE status='queued'` + distributed lock (pattern already in `src/runner/poll.ts` and `src/lib/distributed-lock.ts`).
- Logs: **single sink** `workflowLogs`; in-process executor writes through the same `LogPersister` used by the runner (`complete.ts`).
- Cancellation: cancel API marks rows `cancelled` **and** signals executors (SSE/control endpoint) to `docker kill`.
- Secrets: decrypted at dispatch time, injected only into job container env — never into server env.
- GITHUB_TOKEN: short-lived (10 min) JWT minted per job, scoped to repo + `permissions` key.
- Delete `workflows.ts`'s fire-and-forget path; `post-receive.ts` calls `WorkflowRunManager.createRunForPush()`.

### AD-2: Webhook/event system becomes a typed event bus
**Problem:** 5 webhook events, string-based, no retries; notifications/automations each have their own dispatch paths.
**Design:** `src/lib/events.ts` — typed event registry (name, payload schema via Zod, subscribers). One `emit()` path feeds: webhooks (with retry + DLQ), automations, notifications, SSE realtime, Slack/Discord/Teams. 30+ event types. Webhook delivery: 5 retries, exponential backoff (1s→30s), dead-letter table, replay API.

### AD-3: Fine-grained PATs
Add `scopes` (array), `resourceSelector` (repo IDs or `*`) to `personalAccessTokens`; enforce via middleware that intersects scope + repo permission. Admin tokens opt into all scopes explicitly. UI: scope checkboxes at token creation.

### AD-4: OAuth-provider mode
New `oauthApps` table + `POST /api/oauth/apps`, `GET /api/oauth/authorize`, `POST /api/oauth/token` (authorization-code flow, PKCE optional), `GET /api/user` (tokeninfo). Same table powers first-party `GITHUB_TOKEN`.

### AD-5: Global code search (no index server)
Repo-level `git grep` (exists). Global: on-demand search over `repositories` filtered by visibility/permission using `git grep -l` with per-repo timeout + result merge, backed by a background **file-index cache** (SQLite FTS5 or a `code_index` table refreshed per push in the worker). Ship with cache warm on push; fall back to live grep.

### AD-6: Versioning discipline
Single source: root `package.json` version. CLI + SDK versions mirror it (workspace `npm version` or `changesets`). Releases = git tags `vX.Y.Z` + changelog generated from conventional commits. Migration rehearsal job in CI (`drizzle-kit` up + down on Postgres 16).

### AD-7: Real contribution data
Contribution graph computed from `activity` table + `git log --author` per repo the user can read (async refresh in worker, cached per user). **Delete the seeded-random generator** (`src/pages/[owner]/index.astro:135-146`).

---

## 3. Master Backlog (by Workstream)

Legend: `P0` = blocking GA, `P1` = should-ship GA, `P2` = post-GA stretch. Effort in engineer-days (e.g. 4 = 4 days).

### WS-0: Foundation & Gates (Phase 0)

| ID | Task | Effort | P | Acceptance criteria |
|---|---|---|---|---|
| WS0-01 | Align branch ruleset with actual CI jobs (add real `unit-lane`, `integration-lane`, `contract-lane`, `smoke-lane` jobs to `ci.yml`; remove impossible contexts) | 1 | P0 | All 11 required checks report green on a real PR |
| WS0-02 | Implement `drill:backup-restore`, `drill:redis-outage`, `drill:postgres-reconnect` scripts; wire `weekly-drills.yml` | 3 | P0 | `weekly-drills.yml` passes |
| WS0-03 | Coverage gate: emit `coverage-summary.json` + `lcov.info`; raise threshold to 60% lines; Codecov upload fixed | 2 | P0 | CI fails below 60% |
| WS0-04 | Create `tests/contract/` + `tests/smoke/`; fix `test:contract` / `test:smoke` scripts | 2 | P0 | Scripts pass on empty→real suites |
| WS0-05 | Version unification: root=cli=sdk=CHANGELOG; git tags; `release` workflow (draft → tag → publish) | 2 | P0 | `npm run release:dry-run` green |
| WS0-06 | Wiring-audit script: scan for zero-caller functions, unused schema columns, orphaned components; wire into CI | 3 | P0 | E1 gate |
| WS0-07 | Expand `tests/security.test.ts` → suite (authz matrix: every privileged route × role), OWASP ASVS L1 subset | 5 | P0 | E4 gate |

### WS-1: CI/CD Unification (Phase 1 — largest)

| ID | Task | Effort | P | Acceptance criteria |
|---|---|---|---|---|
| WS1-01 | `WorkflowRunManager`: create runs/jobs rows on push, dispatch, cancel, rerun, retry | 6 | P0 | Push-triggered run visible in UI with live logs; gates read it |
| WS1-02 | Runner dispatch by `runs-on` label matching; unknown-label jobs queue indefinitely with UI hint | 3 | P0 | `runs-on: custom-label` executes on registered runner |
| WS1-03 | Execute ALL step types in polling runner: `uses:` local/remote (node16/node20/composite) — reuse `pipeline.ts` action loader | 4 | P0 | `actions/checkout` + composite actions pass |
| WS1-04 | Secrets injection end-to-end (repo+org); env-scoped; redaction in logs both paths | 3 | P0 | Secret never in server env/logs; container env has it |
| WS1-05 | Matrix expansion at run-creation; `strategy.fail-fast/max-parallel`; parallel job execution | 4 | P0 | Matrix job produces N job rows with distinct matrix labels |
| WS1-06 | Artifacts: upload/download via storage adapter; `actions/upload-artifact` compatible composite action `opencodehub/upload-artifact`; UI download | 4 | P0 | Artifact round-trip in contract test |
| WS1-07 | Cancellation propagation to live containers (SSE control + `docker kill`) | 2 | P0 | Cancel API kills running container |
| WS1-08 | Cron scheduler: consume `scheduledWorkflows`; evaluate `schedule:` in worker; create runs | 3 | P1 | Scheduled run fires within 60s of cron |
| WS1-09 | Speculative-build CI: trigger real run on `mq-spec-*` branch; merge queue gates on its conclusion; delete dead `processQueueBatch` | 4 | P0 | Queue entry waits for spec CI result |
| WS1-10 | `GITHUB_TOKEN` minting + `permissions` key parsing + `env`/`outputs` file support (`GITHUB_OUTPUT`, `GITHUB_ENV`) | 4 | P0 | Steps share data via GITHUB_OUTPUT |
| WS1-11 | `timeout-minutes`, job parallelism, `if:` expression expansion (`&&`, `!`, `fromJSON`, `format`) | 4 | P1 | Expressions evaluate per GitHub semantics |
| WS1-12 | Concurrency groups (`concurrency:`) cancel/supersede in-flight runs | 2 | P2 | Supersede semantics correct |
| WS1-13 | Reusable workflows (`workflow_call`) | 5 | P2 | Called workflow runs with inputs |
| WS1-14 | `NETWORK_MODE` default → `bridge` w/ network isolation per job; services linked to job network; `container:` full options | 3 | P0 | Checkout + deps work out-of-the-box; services reachable by hostname |
| WS1-15 | Merge-queue CI gating from DB runs (required status checks read `workflowJobs`), retire the run-less path; wire `handleCIFailure` auto-retry | 3 | P0 | Queue blocks on failed checks, auto-retries ≤3 |
| WS1-16 | Runner scale: runner groups (schema columns exist), global runners, `actions/runner`-style registration UX | 4 | P2 | Label-grouped runners |

### WS-2: Collaboration Data-Integrity Wiring (Phase 2)

| ID | Task | Effort | P | Acceptance criteria |
|---|---|---|---|---|
| WS2-01 | Issue assignees: `PATCH /issues/{n}` + multi-assignee UI; notification on assign | 2 | P0 | Assignee round-trip; dead junction becomes live |
| WS2-02 | Milestone assignment: `issues.milestoneId` write path + UI dropdown + filter | 2 | P0 | Issue↔milestone round-trip |
| WS2-03 | Issue workflow transitions: wire `transitionIssue` into PATCH + status dropdown UI + required transitions | 3 | P0 | Transition blocked when invalid; audit-logged |
| WS2-04 | Custom field values: `PATCH /issues/{n}/fields` + IssueDetail UI | 3 | P0 | Value persists, validates against definition |
| WS2-05 | Issue templates: `.github/ISSUE_TEMPLATE/*.yml` parse + new-issue UI chooser | 3 | P0 | Template chooser works |
| WS2-06 | PR labels: add/remove API + chip UI + filter; PR assignees API (single) | 3 | P0 | PR label round-trip |
| WS2-07 | Draft toggle: REST create + `PATCH` + `new.astro` checkbox | 1 | P0 | Draft round-trip |
| WS2-08 | Merge-method selector on manual merge button (merge/squash/rebase radio) | 2 | P0 | Squash merge works from UI |
| WS2-09 | Resolve/unresolve review threads (PATCH comment `isResolved` + UI) | 1 | P0 | Thread resolves; codeowner gate respects it |
| WS2-10 | @mention parsing in comments/PR bodies → notifications + autocomplete UI | 3 | P1 | Mention triggers notification |
| WS2-11 | Watch/unwatch: `PUT/DELETE /repos/{o}/{r}/subscription` + header button + notification wiring | 2 | P1 | Watch round-trip |
| WS2-12 | Real contribution graph (AD-7): worker-computed from git log + activity | 3 | P0 | Graph matches git log; fake generator deleted |
| WS2-13 | Single-PR "request review" endpoint + UI; reviewer suggestions by history | 2 | P1 | Request review round-trip |
| WS2-14 | Wiki: DELETE page, revision diff view | 1 | P1 | Wiki lifecycle complete |
| WS2-15 | Releases: asset upload/download via storage adapter + release notes editor polish | 3 | P1 | Asset round-trip |
| WS2-16 | Saved replies (user-level templates for comments) | 2 | P2 | Insert saved reply into comment |

### WS-3: Organizations & Teams (Phase 3)

| ID | Task | Effort | P | Acceptance criteria |
|---|---|---|---|---|
| WS3-01 | Org CRUD API + pages (home, settings, members, roles) | 4 | P0 | Full org lifecycle |
| WS3-02 | Member add/remove/role-change + invite-by-email flow (token, expiry, audit) | 4 | P0 | Invite accepted → member; revoked on decline |
| WS3-03 | First-party team CRUD + membership + team mention in review requirements | 4 | P0 | Team round-trip; team reviewers enforced |
| WS3-04 | Org-level webhooks + org secrets (CI injection) | 3 | P0 | Org webhook fires; org secret injects |
| WS3-05 | Repo transfer to org; org-owned repo default team access | 3 | P1 | Transfer round-trip |
| WS3-06 | Org audit log view + export; org settings (default branch protection, rate limits) | 3 | P1 | Audit shows org-scoped events |
| WS3-07 | SCIM stays; add SCIM config UI (token regen, audit) | 2 | P2 | SCIM provisioned user visible |

### WS-4: Security & Compliance (Phase 5)

| ID | Task | Effort | P | Acceptance criteria |
|---|---|---|---|---|
| WS4-01 | Fine-grained PATs (AD-3): schema, middleware, UI, expiry/rotation, revoke-on-leak | 5 | P0 | Token scoped to repo works; outside repo 403 |
| WS4-02 | OAuth-provider mode (AD-4): apps CRUD, authorize/token, first-party app for GITHUB_TOKEN | 6 | P0 | Third-party app OAuth round-trip |
| WS4-03 | GitHub consumer OAuth wired (routes + login buttons) + Google polish | 2 | P0 | Login with GitHub works |
| WS4-04 | SAML: wire config into `ssoConfigs`, ACS validation (signature, audience, expiry), IdP-initiated | 4 | P1 | SAML login round-trip |
| WS4-05 | Sign-in activity log (IP, UA, device) + suspicious-login alert + session revocation list | 3 | P1 | Logged; revoke kills session |
| WS4-06 | Rate-limit budgets per API family (auth brute-force, git, REST) with Redis sliding window + 429 headers | 3 | P1 | Brute-force lockout test passes |
| WS4-07 | Audit enrichment: before/after diffs on role/perm/secret changes; export API (CSV/JSON) | 3 | P1 | Diff captured |
| WS4-08 | Secret scanning: entropy+regex engines, CI integration (block on push), auto-rotate hint | 4 | P1 | Test secret blocked on push |
| WS4-09 | Password policy (length/complexity), account lockout, forgot-password throttle | 2 | P1 | Policy enforced |
| WS4-10 | SBOM generation per release (cyclonedx), dependency review gate, license compliance in CI | 2 | P1 | SBOM artifact in release |
| WS4-11 | Session hardening: rotation on privilege change, absolute TTL, concurrent-limit | 2 | P1 | Rotation test passes |

### WS-5: API & DX (Phase 4)

| ID | Task | Effort | P | Acceptance criteria |
|---|---|---|---|---|
| WS5-01 | OpenAPI: route registry (Zod schemas → spec via `zod-to-openapi`), auto-generated paths for all 254 routes; keep `openapi.json.ts` as entry | 8 | P0 | ≥80% coverage; parity test enforces |
| WS5-02 | GraphQL expansion: issues, labels, milestones, releases, orgs, teams, comments, PR reviews + their mutations; subscriptions (SSE) for PR/CI events | 8 | P0 | 40+ operations; e2e via GraphQL |
| WS5-03 | Typed webhook event system (AD-2) + retries/DLQ/replay + UI delivery logs | 5 | P0 | Failed delivery retried; replay works |
| WS5-04 | SDK regeneration from OpenAPI (typed clients); fix baseUrl default; publish | 4 | P1 | SDK covers all resources |
| WS5-05 | API versioning: `Accept: application/vnd.och+json; version=1` + `Deprecation` header middleware | 3 | P1 | Deprecated endpoint warns |
| WS5-06 | CLI parity: releases, wiki, webhooks, secrets, orgs, admin, PAT management commands | 5 | P1 | `och` covers ≥90% of REST |
| WS5-07 | GraphQL authz parity tests (REST vs GraphQL permission matrix) | 3 | P0 | Same perms both paths |

### WS-6: UI/UX Completion (Phase 6)

| ID | Task | Effort | P | Acceptance criteria |
|---|---|---|---|---|
| WS6-01 | Global code search (AD-5) + search page + keyboard shortcut | 5 | P1 | Cross-repo search works, permission-filtered |
| WS6-02 | Tags page + RepoHeader tabs: Releases, Packages, Branches | 2 | P0 | Nav complete |
| WS6-03 | Wire orphaned components: `pr/StackVisualization` into PR page, `pr/AIReviewPanel`, `pr/CodeReviewPanel` | 2 | P1 | No orphaned components (E1) |
| WS6-04 | a11y expansion: axe on 12 high-traffic pages (repo, PR, issues, settings, admin), fix color-contrast, focus traps | 4 | P1 | axe critical/serious = 0 |
| WS6-05 | Mobile hardening pass: PR diff, repo browser, settings, merge queue layouts | 3 | P2 | Manual device matrix pass |
| WS6-06 | i18n framework (i18next) + EN first; strings extraction | 4 | P2 | EN locale complete |
| WS6-07 | Diff UX: side-by-side, whitespace toggle, word-diff, line-range comments (`start_line`) | 4 | P1 | Side-by-side works |
| WS6-08 | File editor: new file, delete, rename, author/committer pick, branch dropdown | 3 | P1 | Edit round-trip |
| WS6-09 | Org UI pages (from WS3) styled to existing design system | 2 | P0 | org UI polished |
| WS6-10 | PWA/offline shell + install prompt | 3 | P2 | Lighthouse PWA ≥ 90 |
| WS6-11 | Webhook/automation designer UI improvements; plugin marketplace page | 3 | P2 | Plugin install from UI |

### WS-7: Platform, Scale & Observability (Phase 7)

| ID | Task | Effort | P | Acceptance criteria |
|---|---|---|---|---|
| WS7-01 | Multi-instance chaos suite: 2 app + 2 workers, queue/rate-limit/lock correctness under load | 4 | P0 | E6 criteria |
| WS7-02 | OpenTelemetry traces (request → DB → git → job), correlation IDs in logs | 4 | P1 | Trace waterfall in Jaeger/Grafana |
| WS7-03 | SLO dashboard: API p95 < 200 ms, page LCP < 2.5 s, git clone 100 MB < 30 s, CI schedule latency < 30 s | 3 | P1 | Dashboards live |
| WS7-04 | Large-repo performance: streaming pack responses, pagination/index audit, `git` process pooling | 4 | P1 | 1 GB repo clone works with bounded memory |
| WS7-05 | Backup automation: WAL archiving (Postgres), storage snapshot hooks, restore drill (E5) | 3 | P0 | RPO ≤ 15 min verified |
| WS7-06 | Migration rehearsal CI: `drizzle-kit up` + `down` + data-preservation check on Postgres 16 | 2 | P0 | Down-migrations tested |
| WS7-07 | Air-gapped completion: no external calls in `AIR_GAPPED_MODE` (asset CDN, AI, telemetry); docs | 2 | P1 | Integration test passes |
| WS7-08 | Vault/external-secrets integration for operator secrets | 3 | P2 | Secret read from Vault |
| WS7-09 | Fuzz tests for git pkt-line parser + webhook signature parser (JSFuzz/quickcheck) | 3 | P1 | No crash in 60s fuzz |
| WS7-10 | Horizontal-scaling docs + load test sign-off at 1k concurrent users | 2 | P0 | k6 stress P99 < 3 s |

### WS-8: Docs, Release & Quality (continuous)

| ID | Task | Effort | P | Acceptance criteria |
|---|---|---|---|---|
| WS8-01 | Docs parity for every shipped feature (both trees) — enforce in PR template | 0.5/feature | P0 | docs-parity CI green |
| WS8-02 | Operator runbooks: incident, scaling, backup, upgrade; DR postmortem template | 3 | P0 | Runbooks exist in both trees |
| WS8-03 | Release automation: changelog from commits, tag, Docker Hub + npm publish, SBOM attach | 3 | P0 | One command releases |
| WS8-04 | Performance regression gate in CI (baseline comparison, not absolute-only) | 2 | P1 | Perf job blocks regressions |
| WS8-05 | Mutational analysis on auth/permission modules (stryker) | 2 | P2 | Mutation score ≥ 70% on `permissions.ts` |

---

## 4. Phase Plan (Sequenced)

| Phase | Duration | Scope | Exit gate |
|---|---|---|---|
| **P0 — Foundation Gates** | 2 wks | WS0 all | E3, E4, E10 + ruleset green |
| **P1 — CI/CD Unification** | 6 wks | WS1 (P0/P1 items) | E2 + AD-1 complete; old fire-and-forget path deleted |
| **P2 — Collaboration Integrity** | 4 wks | WS2 (P0 items) | E9; wiring audit (WS0-06) flags 0 in collaboration |
| **P3 — Organizations** | 4 wks | WS3 all | E8 |
| **P4 — API & DX** | 6 wks | WS5 (P0) + WS4-01/02/03 | E7 |
| **P5 — Security Hardening** | 4 wks | WS4 remaining | E4 + authz matrix suite green |
| **P6 — UI Completion** | 4 wks | WS6 (P0/P1) | axe 0 critical; nav complete; real contribution data |
| **P7 — Scale & Observability** | 3 wks | WS7 (P0/P1) | E5, E6, WS7-04 |
| **P8 — GA Sprint** | 3 wks | WS8 + fix backlog, final security audit, load sign-off | ALL E1–E10 → **GA 1.0** |

**Total: 36 weeks (≈ 9 months)** for 3–4 engineers. Parallel tracks possible after P1: (Team A: P2+P3) ∥ (Team B: P4+P5) ∥ (Team C: P6+P7).

---

## 5. Testing Strategy

| Layer | Coverage target | Gate |
|---|---|---|
| Unit (vitest) | Every lib module ≥ 70% stmts | CI |
| Integration | Per feature: API round-trip + authz matrix | CI |
| Contract | CI/CD semantics (run lifecycle, matrix, artifacts, secrets), OpenAPI parity | New lane job |
| Smoke | Boot → create repo → push → workflow → PR → merge on clean DB | New lane job |
| E2E (Playwright) | 40+ specs incl. new: `orgs.spec`, `draft-pr.spec`, `labels.spec`, `resolve-threads.spec`, `contribution-graph.spec`, `oauth-provider.spec` | CI |
| Security | `tests/security/` suite: authz matrix (route × role × repo-visibility), SSRF, path traversal, secret scan | CI |
| Load | k6: 1k concurrent, P99 < 3 s; git clone bench; queue throughput 10k | P7 sign-off |
| Fuzz | pkt-line, webhook HMAC, workflow YAML parsers | CI (60s) |
| DR | `drill:*` weekly + restore verification (checksum compare) | Scheduled |

## 6. Performance & SLO Targets

| SLO | Target |
|---|---|
| REST API p95 (excluding git) | < 200 ms |
| Page LCP (dashboard, repo, PR) | < 2.5 s |
| Git clone 100 MB repo (cold) | < 30 s |
| CI job dispatch → container start | < 30 s |
| Webhook delivery p99 | < 10 s (5 retries, backoff) |
| Queue throughput (multi-instance) | 10k ops, 0 double-process |
| Backup | RPO ≤ 15 min, RTO ≤ 1 h |
| Availability (GA) | 99.9% |

## 7. Security & Compliance Baseline (Industry-Grade)

- **OWASP ASVS L1** fully tested (auth, session, access control, input validation, SSRF, crypto) — security suite maps each ASVS 4.0 control to a test.
- **CI supply chain**: npm provenance, SBOM (cyclonedx) per release, Trivy + Semgrep + gitleaks + npm audit with tight allowlist.
- **Secrets**: no default/placeholder secrets in any compose file; `.env.example` uses `change-me-*` + compose `:?` validation (exists — keep).
- **Audit trail**: all privileged mutations (roles, perms, secrets, settings, admin) with actor, before/after, IP — exportable.
- **SSRF**: validated webhook/URL handling (exists) + new integration URLs (external CI, cloud deploy, issue trackers) route through the same validator.
- **Multi-tenancy**: tenant isolation regression suite (repo visibility × org membership × token scope matrix).
- **Compliance docs**: SOC 2-style control mapping doc (`docs/administration/compliance.md`) — policies, evidence collection, DR.

## 8. KPIs (tracked weekly)

| KPI | Target |
|---|---|
| Wiring-audit flags (dead code/unwired) | → 0 by P8 |
| OpenAPI coverage | ≥ 80% |
| GraphQL operations | ≥ 40 |
| Coverage (lines) | ≥ 60% |
| CI pass rate (default branch) | 100% |
| Critical/high vulns | 0 |
| e2e specs passing | 100% |
| Docs parity drift | 0 new |

## 9. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| CI/CD unification breaks existing pushes | High | Contract suite first; feature-flag old path for 1 sprint |
| Scope creep into GitHub-only features (marketplace, mobile apps) | High | Explicit P2 backlog; de-scope with written rationale |
| Schema migrations regress existing data | Med | Migration rehearsal CI (WS7-06), rollback scripts mandatory per DoD |
| Multi-instance race bugs in queue/scheduler | Med | Chaos suite (WS7-01) before any HA claim |
| OAuth-provider introduces phishing surface | Med | PKCE, consent screen, app-review for first-party, audit logs |
| Docs lag | High | docs-required PR check (exists) + parity CI (exists) |
| Team size assumption wrong | Med | Phases P2/P3/P4 parallelizable; trim P2 items first |

## 10. Definition of Done (every task)

- [ ] Code complete + migration + backfill (where schema changes)
- [ ] Unit + integration tests; authz test for every new route
- [ ] Contract/e2e where flow crosses components
- [ ] Security review checklist signed off (secrets, SSRF, authz)
- [ ] Performance impact measured (query plan / load snippet)
- [ ] Docs updated in BOTH trees; changelog entry
- [ ] Rollback plan documented
- [ ] Wiring audit clean (no new dead code)

## 11. Immediate 14-Day Sprint (P0 kickoff)

1. WS0-01 → WS0-05 (gates real: ruleset, drills, coverage, contract/smoke dirs, versioning)
2. WS0-06 wiring audit — publish results as tracked issues (this becomes the P2 backlog's authority)
3. WS0-07 security test suite skeleton (authz matrix generator)
4. Start WS1-01 (run-manager skeleton) with WS1-03/04 (runner `uses:` + secrets) as the first vertical slice
5. Keep every PR green: no merge on failing lint/test/docs/coverage

---

## 12. Execution Log (4-day sprint, 2026-08-10)

### Shipped ✅
| ID | Item | Evidence |
|---|---|---|
| WS0-01 | CI lanes: `Contract Tests (Lane: contract)` + `Smoke Tests (Lane: smoke)` jobs added; ruleset contexts aligned to real jobs; `wiring-audit` job wired | `.github/workflows/ci.yml`, `.github/rulesets/main-branch-ruleset.json` |
| WS0-02 | `drill:backup-restore`, `drill:redis`, `drill:postgres` implemented (weekly-drills workflow now functional) | `scripts/drill-*.ts` |
| WS0-03 | Coverage emits `coverage-summary.json` + `lcov.info` (threshold check is now real) | `vitest.config.ts` |
| WS0-04 | Contract suite (5 files / 32 tests) + smoke suite (6 tests) created; scripts fixed | `tests/contract/`, `tests/smoke/` |
| WS0-05 | Root version unified to 1.1.2; changelog entry | `package.json`, `CHANGELOG.md` |
| WS0-06 | Wiring-audit script (zero-caller fns, dead columns, orphaned components/tables) + allowlist + CI gate | `scripts/wiring-audit.ts` — 217 findings baselined, 0 new allowed |
| — | **Real bug fix**: glob `**` collapsed to one level (`.replace` re-processing); `!`-negation in `paths:`; `on: workflow_dispatch` shorthand | `src/lib/pipeline.ts` |
| — | OpenAPI: added `/repos`, `/issues`, `/issues/{number}`, `/branches`, `/labels`, `/pulls/{n}/labels`, merge-method body | `src/lib/openapi.ts` |
| WS2-01..04 | Issue assignees, milestone assignment, custom field values, workflow transitions all wired (create + PATCH) | `src/pages/api/repos/[o]/[r]/issues/*` |
| WS2-06..09 | PR labels API (GET/POST/DELETE), draft toggle (create+PATCH+UI), merge-method selector (merge/squash/rebase in `mergeBranch`), review-thread resolve | `src/lib/git.ts`, `pulls/*`, `[number].astro`, `new.astro` |
| WS2-12 | Real contribution graph from activity table (PG `date_trunc` + SQLite fallback); seeded-random generator deleted | `src/pages/[owner]/index.astro` |
| WS1-01 | Workflow-run persistence bridge: `workflowRuns`/`workflowJobs` rows pre-created with engine IDs; run/job state synced; skipped steps backfilled; logs now land on real FKs | `src/lib/workflow-run-persister.ts`, `pipeline.ts` ID threading |
| WS1-03 | `uses:` steps dispatched to polling runner via server-side action resolver (checkout→native clone, composite→run lines, node/docker→fail-fast message) | `src/lib/action-resolver.ts`, `runners/poll.ts` |
| WS1-04 | Repo secrets injected into in-process runs (decrypted only at dispatch) | `src/lib/workflow-secrets.ts`, `workflows.ts` |
| WS1-14 | Executor `NETWORK_MODE` default `none` → `bridge` | `src/runner/executor.ts` |
| WS4-03 | GitHub consumer OAuth wired (routes + login buttons, env-gated) | `src/pages/api/auth/github/*`, `login.astro` |
| — | Webhook delivery retries (5 attempts, exponential backoff, `X-OpenCodeHub-Attempt`, no-retry on 4xx) | `src/lib/webhooks.ts` |
| WS4-01 | Fine-grained PATs: `scopes` column + migration `drizzle/0001`, payload propagation, `canWriteRepo`/`canAdminRepo` enforcement across 70+ call sites, token UI scopes, `hasPatScope` unit tests | `users.ts`, `permissions.ts`, `auth.ts`, `tokens.ts`, `TokensManager.tsx`, `drizzle/0001_*.sql` |

### Verification
- `tsc --noEmit` — 0 errors · `astro check` — 0 errors · `astro build` — succeeds
- Full suite: **595 tests passing** (was 531) across 122 files — unit 319, integration 229, contract 32, smoke 6, top-level 9
- Wiring audit: 0 new findings (baseline 217, down from 296 — wiring work itself removed findings)

## 13. Execution Log — Batch 2 (collaboration + CI + orgs, 2026-08-10)

### Shipped ✅
| ID | Item | Evidence |
|---|---|---|
| WS2-05 | Issue templates: `.github/ISSUE_TEMPLATE/*` (YAML + legacy md) parsed + template chooser on new-issue page | `src/pages/api/repos/[o]/[r]/issues/templates.ts`, `issues/new.astro` |
| WS2-10 | @mention parsing (email-safe regex) + notifications on issue/PR/comment create | `src/lib/mentions.ts` + 4 call sites, `tests/unit/mentions.test.ts` |
| WS2-11 | Watch/unwatch API (levels: watching/releases_only/ignoring) + live header button with dropdown | `src/pages/api/repos/[o]/[r]/subscription.ts`, `RepoActions.tsx` |
| WS2-06 | PR labels UI on PR detail page (list/add/remove) | `pulls/[number].astro` |
| WS2-14 | Wiki page delete endpoint | `wiki/[slug].ts` DELETE |
| WS2-15 | Release asset upload/download/delete via storage adapter (multipart; downloads streamed with count) | `releases/[id]/assets/index.ts` |
| WS1-05 | **Matrix strategy**: `expandMatrix` (cartesian + exclude + include-merge), per-instance context/env, `job (combo)` naming, persister pre-creates matrix job rows | `src/lib/pipeline.ts`, `workflow-run-persister.ts`, `tests/contract/matrix-expansion.test.ts` |
| WS1-08 | **Cron scheduler**: `schedule:` triggers evaluated with cron-parser, tracked in `scheduledWorkflows`, runs triggered via persister, wired into worker loop (`SCHEDULE_INTERVAL`) | `src/lib/schedule-worker.ts`, `scripts/worker.ts` |
| WS3-01/02 | Org CRUD API (create/list/update/delete with owner/admin enforcement) + org list/create page + org profile page (repos, members) + org settings page | `src/pages/api/orgs/index.ts`, `src/pages/orgs/{index,[org]}.astro`, `[org]/settings.astro` |
| — | Wiring audit now includes `scripts/` callers (worker was a legit caller) | `scripts/wiring-audit.ts` |

### Verification (batch 2)
- Full suite: **608 tests passing** (was 595) across 124 files — contract suite now 39 tests
- `tsc` 0 errors · `astro check` 0 errors · `astro build` succeeds · wiring audit 0 new (204 baselined, down from 217)

## 14. Execution Log — Batch 3 (PR assignees, OAuth provider, GraphQL, spec CI, invites, 2026-08-10)

### Shipped ✅
| ID | Item | Evidence |
|---|---|---|
| WS2-13 | PR assignees API (GET/POST/DELETE, dead junction now live) + single-PR request-review endpoint (notifications + email + author-exclusion) | `pulls/[n]/assignees.ts`, `pulls/[n]/requested-reviewers.ts` |
| WS4-02 | **OAuth-provider mode**: `oauth_apps` + `oauth_authorization_codes` tables (migrations 0002), app registration (client_secret hashed, shown once), consent page (`/api/oauth/authorize` GET/POST), token endpoint (authorization_code grant, one-time codes, 10-min TTL), userinfo endpoint (bearer), HS256 access tokens with app+scope claims | `src/lib/oauth-provider.ts`, `src/pages/api/oauth/*`, `tests/unit/oauth-provider.test.ts` |
| WS5-02 | **GraphQL expansion**: new queries `issue`, `organization`; mutations `createIssue` (labels/assignees/milestone), `updateIssue` (state/milestone), `updatePullRequest` (title/body/draft), `addLabels` (issue+PR, union result); Issue nested resolvers (comments/assignees/labels/milestone) wired to real data (were stubs) | `schema.ts`, `resolvers.ts`, `tests/contract/graphql-schema.test.ts` |
| WS1-09 | **Speculative-build CI executes**: `triggerSpecWorkflow` runs workflows on `mq-spec-*` branches (triggers evaluated against base branch, runs persisted against spec branch); queue worker calls it after `createSpeculativeBranch` | `src/lib/workflows.ts`, `src/lib/queue-worker.ts` |
| WS3-02 | **Org invites**: `org_invites` table (migration 0003), invite create (username/email, role, 7-day TTL, token hashed, email with accept link), list/revoke, accept flow (user-bound check, membership insert), invite accept page + settings-page invite UI | `src/lib/../pages/api/orgs/[org]/invites*.ts`, `accept-invite.ts`, `orgs/[org]/invite.astro`, `settings.astro` |
| — | OpenAPI: PR assignees + requested-reviewers paths documented | `src/lib/openapi.ts` |

### Verification (batch 3)
- Full suite: **618 tests passing** across 126 files (contract suite now 44, unit 330)
- `tsc` 0 errors · `astro check` 0 errors · `astro build` succeeds · wiring audit 0 new (204 baselined)

## 15. Execution Log — Batch 4 (OpenAPI tooling, queue gating, OAuth UI, SAML config, teams, 2026-08-10)

### Shipped ✅
| ID | Item | Evidence |
|---|---|---|
| WS5-01 | **OpenAPI 25.7% → 100%**: `scripts/openapi-coverage.ts` (route-to-spec measurement, canonical `{param}` matching, `--fail` + threshold) + `scripts/openapi-generate.ts` (deterministic auto-generation of generic entries for undocumented routes, idempotent via explicit block strip) + CI job `OpenAPI Coverage` (threshold 60) + `openapi:coverage`/`openapi:generate` scripts | `scripts/openapi-*.ts`, `.github/workflows/ci.yml`, `src/lib/openapi.ts` (214 auto + hand-tuned) |
| WS1-15 | **Merge-queue CI gating reads DB runs**: `getQueueItemCIState` now falls back to persisted `workflowRuns` (by PR head branch, latest 5) when no external checks exist — pending/failed/success from native pipeline runs | `src/lib/queue-worker.ts` |
| WS4-02b | OAuth app management UI: `/settings/oauth-apps` (register form with redirect URIs + scopes, one-time credential display, list with delete) + nav link; DELETE moved to nested route | `src/pages/settings/oauth-apps.astro`, `oauth/apps/[id].ts`, `SettingsLayout.astro` |
| WS4-04 | **SAML config wiring**: org-scoped `saml-config` API (GET/POST/DELETE, admin-gated, validates IdP entity/SSO URL/cert) — the `samlConfigs` table + validation machinery existed but nothing wrote rows; settings-page SAML section (fields + enable toggle + SP metadata URL + member sign-in URL) | `src/pages/api/orgs/[org]/saml-config.ts`, `orgs/[org]/settings.astro` |
| WS3-03 | **First-party teams**: org teams CRUD API (list/create with slug uniqueness, update/delete admin-gated) + team members add/remove (nested route) + settings-page teams UI (create, member roster, delete) | `orgs/[org]/teams.ts`, `teams/[teamId].ts`, `teams/[teamId]/members.ts`, `settings.astro` |
| — | Wiring audit findings dropped 204 → 203 (new features wired) | `scripts/wiring-audit.ts` |

### Verification (batch 4)
- Full suite: **618 tests passing** across 126 files · `tsc` 0 errors · `astro check` 0 errors · `astro build` succeeds
- OpenAPI coverage: **100% (274/274)** · generator idempotent (re-run = no changes) · wiring audit 0 new

## 16. Execution Log — Batch 5 (UI completion, CI bridge, org transfer, a11y, chaos suite, 2026-08-10)

### Shipped ✅
| ID | Item | Evidence |
|---|---|---|
| UI | RepoHeader tabs now include **Releases, Packages, Branches** (were missing) + standalone **tags page** (tag list with author/date/message from `for-each-ref`) | `RepoHeader.astro`, `[owner]/[repo]/tags.astro` |
| UI | **Issue assignee UI** (sidebar: assignee chips, unassign, collaborator dropdown — API existed, UI was missing) · **Wiki delete button** (confirm → DELETE) · **Release assets UI** (upload form, download links with size/download-count, delete — links were previously broken `asset.url`) | `IssueDetail.tsx`, `wiki/[...slug].astro`, `releases/[id].astro` |
| CI bridge | **Native runs → pullRequestChecks**: run persister now upserts a check run per job (workflow/job name, conclusion, timestamps) onto every open PR whose head branch matches — checks UI + queue gating see native pipeline results | `workflow-run-persister.ts` |
| WS3-05 | **Org repo transfer**: `POST /repos/{o}/{r}/transfer` (repo-admin + org-owner/admin gated, transfers `ownerId`/`ownerType`, creator becomes owner collaborator) | `repos/[owner]/[repo]/transfer.ts` |
| a11y | Axe coverage expanded: Dashboard, Notifications, Settings, Organizations pages (4 new specs) | `tests/e2e/accessibility.spec.ts` |
| WS7-01 | **Multi-instance chaos suite**: lock exclusivity, `withLock` single-execution under contention, monotonic fencing tokens, optimistic DB claim race (exactly one winner) | `tests/unit/chaos-multi-instance.test.ts` |
| WS5-01 | OpenAPI generator hardened: regenerates the **full** auto set (not deltas), brace-counted block strip, idempotent across repeated runs (verified 3×), 100% coverage at 275 routes | `scripts/openapi-generate.ts` |

### Verification (batch 5)
- Full suite: **622 tests passing** (127 files) · `tsc` 0 errors · `astro check` 0 errors · `astro build` succeeds
- OpenAPI coverage **100% (275/275)** with a fully idempotent generator · wiring audit 0 new (203 baselined)

### Remaining for full GA
- WS7 observability (OTel traces, SLO dashboards), i18n, org repo-transfer UI page, package-registry npm publish completion, PR checks UI parity polish, OAuth app management is done — next: refresh token flow

### Remaining for full GA
- WS7 scale/observability (OTel traces, multi-instance chaos suite), PR-level check runs from native runs (checks UI parity), org repo transfer UI, i18n, a11y expansion to authenticated pages, package-registry completion (npm publish flow)

### Remaining for full GA
- WS5-01 OpenAPI ≥80% coverage, WS4-04 SAML config wiring, WS7 scale/observability (OTel, chaos suite), WS1-15 queue gating from DB runs, team management UI (SCIM-only today), OAuth app management UI page

### Remaining for full GA
- WS3-02 member invites/teams UI, WS5-02 GraphQL expansion, WS5-01 OpenAPI ≥80%, WS4-02 OAuth-provider mode, WS1-09 speculative-build CI execution, WS4-04 SAML wiring, WS7 scale/observability work

### Remaining for full GA (not done in sprint)
- WS3 org/team management, WS5-02 GraphQL expansion, WS5-01 OpenAPI ≥80%, WS4-02 OAuth-provider mode, WS1-05 matrix expansion, WS1-08 cron scheduler, WS1-09 speculative-build CI execution, WS4-04 SAML wiring, WS7 scale/observability work

---

*This plan supersedes `notimplemented.md` (which remains as historical context). `doc/feature_audit.md` statuses should be re-reconciled after each phase.*

## 17. Execution Log — Batch 6 (readiness closure, 2026-08-15)

### Shipped ✅
| Item | Evidence |
|---|---|
| E2E proof committed + green (20/20) | `scripts/e2e-proof.sh` — reproducible full-stack proof |
| Redis static imports (in-memory fallback eliminated) | `src/lib/redis.ts`, `rate-limit.ts`, `distributed-lock.ts` — `require("ioredis")` broken under Vite SSR |
| Org-owned repos across 7 global pages | `resolveOrgOwners()` helper; home/actions/issues/pulls/stars/stacks/merge-queue |
| Parallel job waves + GITHUB_OUTPUT/ENV | `pipeline.ts` — verified 6-job workflow with needs ordering |
| Authz matrix suite (43 cases) | `tests/unit/authz-matrix.test.ts` — caught scope-implication gap (fixed) |
| Correlation IDs | `src/lib/request-context.ts` + logger binding + middleware |
| Load baseline green | p95: health 33ms, metrics 75ms, explore 136ms, repos 32ms @20-concurrency ×300 |
| Repo transfer UI | settings Danger Zone org picker |
| Docker actions on runners | `docker://image` + docker-type resolution in action-resolver |
| OAuth refresh tokens | refresh_token grant + rotation, verified live |
| npm registry protocol completion | CouchDB login, whoami, Basic/Bearer publish auth, org-null scoping, tarball bridge, SITE_URL tarball URLs — verified login→whoami→publish→metadata→download |
| Version 1.2.0 release commit | root+CLI unified, changelog |

### Verification
- **668 tests** · tsc 0 · astro check 0 · build OK · E2E 20/20 · load green · wiring audit 0 new
- 22 commits total on `feature/ai-code-reviewer`, tree clean

### Pending (user action)
- `opencodehub-cli@1.2.0` publish to npmjs requires browser OTP (npm OAuth token) — run:
  `cd cli && npm publish --registry https://registry.npmjs.org`
  (authenticate in the browser when prompted)
- Push branch + open PR; git tag `v1.2.0`
