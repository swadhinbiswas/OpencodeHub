# Missing / Not-Implemented Tracker

Date: 2026-02-15
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

## D) Existing Broad Audit (High-Level)

`doc/feature_audit.md` already tracks feature-level implementation state across 122 features:
- Implemented: 47
- Partial: 29
- Missing: 46

Use that document for roadmap-level planning and this tracker for code-level execution items.

## Suggested Next Implementation Order

1. Close hard runtime blockers first:
   - Choose supported DB drivers and remove/guard unsupported ones (`src/db/adapter/index.ts`).
   - Implement or disable `anthropic` provider path in `src/lib/ai/index.ts`.
2. Resolve TODOs that affect correctness/security:
   - Issue create permission check.
   - Team reviewer enforcement in PR state transitions.
3. Replace placeholders with production paths:
   - Automations builder UI flow.
   - Digest generation from real activity data.
   - PR file dependency detection.
