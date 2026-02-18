# Missing / Not-Implemented Tracker

Date: 2026-02-18
Scope: `src/`, `cli/`, `packages/`, and existing audit docs.

## Summary
- Explicit `not implemented` runtime blockers: 15
- Explicit `TODO` implementation gaps: 5
- Partial/placeholder implementations verified in code: 7
- Existing broad feature audit available at `doc/feature_audit.md` (last updated 2026-02-06)

## A) Runtime Blockers (Explicit Not Implemented)

| Status | Area | Evidence |
|---|---|---|
| Implemented (2026-02-15) | DB adapter: `mysql` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `mongodb` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `turso` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `planetscale` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `redis` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `firestore` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `dynamodb` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `neo4j` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `cockroachdb` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `cassandra` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `scylladb` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `surrealdb` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `tidb` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | DB adapter: `mariadb` | `src/db/adapter/index.ts` |
| Implemented (2026-02-15) | AI provider: `anthropic` | `src/lib/ai/index.ts` |

## B) TODO Gaps (Declared but Incomplete)

| Status | Area | Evidence |
|---|---|---|
| Implemented (2026-02-15) | Admin storage config test action | `src/pages/api/admin/config/storage.ts` |
| Implemented (2026-02-15) | Issue detail page assignees mapping | `src/pages/[owner]/[repo]/issues/[number].astro` |
| Implemented (2026-02-15) | Issue detail page labels mapping | `src/pages/[owner]/[repo]/issues/[number].astro` |
| Implemented (2026-02-15) | Issue creation permission check | `src/pages/[owner]/[repo]/issues/new.astro` |
| Implemented (2026-02-15) | Team-based reviewer requirements in PR state updates | `src/pages/api/repos/[owner]/[repo]/pulls/[number]/index.ts` |

## C) Placeholder / Mock Implementations

| Status | Area | Evidence |
|---|---|---|
| Implemented (2026-02-15) | Automation builder now supports create/edit/toggle/delete rule flows from UI | `src/pages/settings/automations.astro` |
| Implemented (2026-02-15) | File-based PR dependency detection with conflict graph edges | `src/lib/pr-dependencies.ts` |
| Implemented (2026-02-15) | GraphQL stargazer count from `repository_stars` table | `src/lib/graphql/resolvers.ts` |
| Implemented (2026-02-15) | Notification digests now render real user notifications with summary counts | `src/lib/chat-notifications.ts` |
| Implemented (2026-02-15) | SonarQube trigger now fetches quality gate + persists issues when available | `src/lib/code-quality.ts` |
| Implemented (2026-02-15) | Snyk scan now parses API vulnerabilities and persists issue records | `src/lib/code-quality.ts` |
| Implemented (2026-02-15) | Admin metrics user growth now computed from real user creation dates | `src/pages/admin/_metrics-disabled.txt` |
| Implemented (2026-02-18) | Runner auth tokens now stored hashed + verified with timing-safe checks | `src/lib/runner-secrets.ts`, `src/pages/api/actions/runners/register.ts`, `src/pages/api/actions/runners/poll.ts`, `src/pages/api/actions/runners/job/[id]/complete.ts`, `src/db/schema/pipeline-runners.ts` |
| Implemented (2026-02-18) | Runner poll endpoint now performs race-safe job claims | `src/pages/api/actions/runners/poll.ts` |
| Implemented (2026-02-18) | Runner completion endpoint now enforces repository/job ownership checks | `src/pages/api/actions/runners/job/[id]/complete.ts` |
| Implemented (2026-02-18) | Manual action trigger endpoint now enforces write permissions and stable run numbering | `src/pages/api/actions/trigger-test.ts` |
| Implemented (2026-02-18) | Workflow secrets are now encrypted-at-rest with legacy plaintext migration on access | `src/lib/workflow-secret-crypto.ts`, `src/pages/[owner]/[repo]/settings/actions/runners.astro`, `src/pages/api/actions/runners/register.ts` |
| Implemented (2026-02-18) | Runner registration token TTL enforcement and automatic rotation on settings access | `src/pages/api/actions/runners/register.ts`, `src/pages/[owner]/[repo]/settings/actions/runners.astro`, `.env.example` |
| Implemented (2026-02-18) | One-time runner registration tokens with consumption on first use and revoke API | `src/lib/runner-registration-token.ts`, `src/pages/api/actions/runners/register.ts`, `src/pages/api/actions/runners/registration-tokens.ts`, `src/pages/[owner]/[repo]/settings/actions/runners.astro` |
| Implemented (2026-02-18) | Repository custom issue fields settings API wired to existing UI | `src/pages/api/repos/[owner]/[repo]/settings/fields.ts`, `src/pages/api/repos/[owner]/[repo]/settings/fields/[id].ts` |
| Implemented (2026-02-18) | Advanced analytics APIs for hotspots and metrics export | `src/pages/api/repos/[owner]/[repo]/analytics/hotspots.ts`, `src/pages/api/repos/[owner]/[repo]/analytics/export.ts` |
| Implemented (2026-02-18) | Custom dashboard APIs (list/create/get/delete/add widget) | `src/pages/api/analytics/dashboards/index.ts`, `src/pages/api/analytics/dashboards/[id].ts`, `src/pages/api/analytics/dashboards/[id]/widgets.ts` |
| Implemented (2026-02-18) | Cross-repo change sets API + state updates | `src/pages/api/change-sets/index.ts`, `src/pages/api/change-sets/[id].ts`, `src/lib/dependency-awareness.ts` |
| Implemented (2026-02-18) | Breaking-change detection now uses real PR diff/files with persisted findings | `src/lib/dependency-awareness.ts`, `src/pages/api/repos/[owner]/[repo]/pulls/[number]/impact.ts` |
| Implemented (2026-02-18) | Migration detection endpoint integrated into PR impact scan | `src/lib/dependency-awareness.ts`, `src/pages/api/repos/[owner]/[repo]/pulls/[number]/impact.ts` |
| Implemented (2026-02-18) | Terraform/IaC hook triggering via repo API and automation actions | `src/lib/iac-hooks.ts`, `src/pages/api/repos/[owner]/[repo]/iac/hooks.ts`, `src/lib/automations.ts`, `src/db/schema/automations.ts` |
| Implemented (2026-02-18) | Cloud deploy hooks for AWS/GCP/Azure/Kubernetes exposed via repo API and automations | `src/lib/cloud-hooks.ts`, `src/pages/api/repos/[owner]/[repo]/cloud/deploy.ts`, `src/lib/automations.ts`, `src/db/schema/automations.ts` |

## D) Existing Broad Audit (High-Level)

`doc/feature_audit.md` tracks feature-level implementation state:
- Implemented: 70
- Partial: 55
- Missing: 0

Use that document for roadmap-level planning and this tracker for code-level execution items.

## E) Remaining Production Gaps (Not Yet Solved)

| Priority | Area | Gap |
|---|---|---|
| Implemented (2026-02-18) | Runner API authentication model | Added explicit audit trail/history for token issuance/revocation/consumption via `audit_logs` + API + settings UI. |
| Implemented (2026-02-18) | Runner job dispatch | Poll/complete APIs + runner client now support multi-step job execution with step-level state transitions (`queued` → `in_progress` → `completed`) and incremental step dispatch. |
| Implemented (2026-02-18) | Queue worker fidelity | Replaced sleep-based CI simulation with real pull-request check-state gating (`pull_request_checks`) and queue-item progression based on ingested CI outcomes. |
| Implemented (2026-02-18) | Actions logs retrieval | Added paginated per-job logs API + lazy loading and incremental “Load more” UI to avoid broad run-wide log fetches. |
| Implemented (2026-02-18) | External ecosystem parity hardening | Added provider-specific webhook route tests and operations runbook for CI, issue trackers, and quality providers (`tests/integration/provider-webhook-routes.test.ts`, `tests/unit/external-ci-providers.test.ts`, `doc/external-ecosystem-runbook.md`). |

## F) Feature Audit Reconciliation (2026-02-18)

- `doc/feature_audit.md` legacy missing count was `46`.
- After code reconciliation + implementation passes, explicit `❌ missing` entries are now `0`.
- Remaining gaps are implementation depth and production-hardening tasks, not binary feature absence.

## Suggested Next Implementation Order

1. Implement encryption-at-rest for `workflow_secrets` and migration for existing rows.
2. Add runner registration token lifecycle controls (rotation, expiry, revoke).
3. Upgrade runner execution protocol to support full multi-step jobs with step status updates.
4. Replace queue-worker simulation paths with real pipeline status integration.
