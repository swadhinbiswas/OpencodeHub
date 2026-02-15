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
| Missing | DB adapter: `mysql` | `src/db/adapter/index.ts:23` |
| Missing | DB adapter: `mongodb` | `src/db/adapter/index.ts:25` |
| Missing | DB adapter: `turso` | `src/db/adapter/index.ts:27` |
| Missing | DB adapter: `planetscale` | `src/db/adapter/index.ts:30` |
| Missing | DB adapter: `redis` | `src/db/adapter/index.ts:32` |
| Missing | DB adapter: `firestore` | `src/db/adapter/index.ts:34` |
| Missing | DB adapter: `dynamodb` | `src/db/adapter/index.ts:37` |
| Missing | DB adapter: `neo4j` | `src/db/adapter/index.ts:40` |
| Missing | DB adapter: `cockroachdb` | `src/db/adapter/index.ts:42` |
| Missing | DB adapter: `cassandra` | `src/db/adapter/index.ts:44` |
| Missing | DB adapter: `scylladb` | `src/db/adapter/index.ts:47` |
| Missing | DB adapter: `surrealdb` | `src/db/adapter/index.ts:50` |
| Missing | DB adapter: `tidb` | `src/db/adapter/index.ts:53` |
| Missing | DB adapter: `mariadb` | `src/db/adapter/index.ts:56` |
| Missing | AI provider: `anthropic` | `src/lib/ai/index.ts:15` |

## B) TODO Gaps (Declared but Incomplete)

| Status | Area | Evidence |
|---|---|---|
| Partial | Admin storage config test action | `src/pages/api/admin/config/storage.ts:68` |
| Partial | Issue detail page assignees mapping | `src/pages/[owner]/[repo]/issues/[number].astro:80` |
| Partial | Issue detail page labels mapping | `src/pages/[owner]/[repo]/issues/[number].astro:81` |
| Partial | Issue creation permission check | `src/pages/[owner]/[repo]/issues/new.astro:39` |
| Partial | Team-based reviewer requirements in PR state updates | `src/pages/api/repos/[owner]/[repo]/pulls/[number]/index.ts:140` |

## C) Placeholder / Mock Implementations

| Status | Area | Evidence |
|---|---|---|
| Partial | Automation builder UI uses placeholder alerts instead of full builder flow | `src/pages/settings/automations.astro:454` |
| Partial | File-based PR dependency detection logs not implemented and returns empty conflicts | `src/lib/pr-dependencies.ts:93` |
| Partial | GraphQL stargazer count returns constant `0` because stars table path is not implemented | `src/lib/graphql/resolvers.ts:212` |
| Partial | Notification digests are placeholder HTML with `itemCount: 0` | `src/lib/chat-notifications.ts:554` |
| Partial | SonarQube trigger creates pending report instead of running scanner | `src/lib/code-quality.ts:330` |
| Partial | Snyk scan path currently simulates result with empty issue list | `src/lib/code-quality.ts:437` |
| Partial | Admin metrics page has simplified mock user growth (`Promise.resolve([])`) | `src/pages/admin/_metrics-disabled.txt:57` |

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
