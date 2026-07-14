---
title: "Database Schema"
---

OpenCodeHub uses Drizzle ORM with 38 schema tables defined in `src/db/schema/`.

## Schema Files

| File | Tables | Purpose |
|------|--------|---------|
| `users.ts` | `users` | User accounts, passwords, OAuth, 2FA, admin flags |
| `repositories.ts` | `repositories` | Git repos, visibility, disk paths, settings |
| `pull-requests.ts` | `pullRequests` | PRs, states, branches, merge status |
| `issues.ts` | `issues` | Issue tracking |
| `projects.ts` | `projects` | Project boards, columns, cards |
| `stacked-prs.ts` | `prStacks`, `prStackEntries` | Stacked PR relationships |
| `merge-queue.ts` | `mergeQueue` | Queue entries with priority, CI status, attempts |
| `workflows.ts` | `workflows`, `workflowRuns`, `workflowJobs`, `workflowSteps` | CI/CD pipeline execution |
| `pipeline-runners.ts` | `pipelineRunners` | Registered CI runners |
| `ai-reviews.ts` | `aiReviews` | AI code review results |
| `ai-review-rules.ts` | `aiReviewRules` | AI review rule configurations |
| `developer-metrics.ts` | `developerMetrics` | PR metrics, cycle time |
| `branch-protection.ts` | `branchProtection`, `reviewRequirements`, `requiredStatusChecks` | Branch rules |
| `webhooks.ts` | `webhooks` | Outbound webhook configs |
| `automations.ts` | `automations` | Workflow automation rules |
| `slack-integration.ts` | `slackIntegration` | Slack notification configs |
| `organizations.ts` | `organizations` | Organizations |
| `teams.ts` | `teams` | Team membership |
| `roles.ts` | `roles` | Role-based access control |
| `activity.ts` | `activity` | Activity/audit log |
| `security.ts` | `security` | Security scan results |
| `security-policies.ts` | `securityPolicies` | Security policy definitions |
| `sso.ts` | `sso` | SSO/OIDC configuration |
| `wiki.ts` | `wiki` | Repository wiki pages |
| `deploy-keys.ts` | `deployKeys` | SSH deploy keys |
| `path-permissions.ts` | `pathPermissions` | File-level access control |
| `pr-states.ts` | `prStates` | Custom PR states |
| `issue-statuses.ts` | `issueStatuses` | Custom issue statuses |
| `custom-fields.ts` | `customFields` | Custom issue/project fields |
| `auto-merge-rules.ts` | `autoMergeRules` | Auto-merge configuration |
| `external-ci.ts` | `externalCIConfigs`, `externalBuilds` | External CI integration |
| `review-rules.ts` | `reviewRules` | Review requirements and reviewer routing |
| `integrations.ts` | `integrations` | Code quality, dashboard, deployment integrations |
| `packages.ts` | `packages` | Package registry metadata |
| `inbox-sections.ts` | `inboxSections` | Custom inbox sections |
| `notification-preferences.ts` | `notificationPreferences` | Per-user notification settings |
| `system-config.ts` | `systemConfig` | System-wide configuration |

## Relationships

Key relationships between tables:
- `repositories` → `users` (owner)
- `pullRequests` → `repositories` (repo) + `users` (author)
- `prStacks` → `repositories` + `prStackEntries` → `pullRequests`
- `mergeQueue` → `pullRequests` + `repositories`
- `workflowRuns` → `workflows` + `repositories`
- `issues` → `repositories` + `users`
- `projects` → `repositories`

## Migrations

We use `drizzle-kit` for migrations.

**Generate a migration:**
```bash
npm run db:generate
```

**Apply migrations:**
```bash
npm run db:migrate
```

**Push schema (prototyping — no migration files):**
```bash
npm run db:push
```

**Open Drizzle Studio GUI:**
```bash
npm run db:studio
```

## Database Support

| Driver | Use Case | Notes |
|--------|----------|-------|
| `postgres` | Production | Required. All schemas use `pgTable` |
| `sqlite` | Development | Simple local setup |
| `turso` | Edge (Vercel) | LibSQL for serverless deployments |
