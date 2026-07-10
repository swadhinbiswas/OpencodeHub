# OpenCodeHub Features Snapshot
Last updated: February 19, 2026

Canonical source: `doc/feature_audit.md`

## Recently completed
- Local free-model AI support (`local` provider, Ollama/OpenAI-compatible) with configurable `localBaseUrl` and key.
- External-agent (Greptile-like) callback and async AI review flow documented and supported.
- PR dependency APIs:
  - `GET /api/repos/{owner}/{repo}/pulls/dependencies`
  - `POST /api/repos/{owner}/{repo}/pulls/stack-order`
- Stack operations:
  - `POST /api/repos/{owner}/{repo}/stacks/{stackId}/auto-update`
  - `POST /api/repos/{owner}/{repo}/stacks/{stackId}/merge`
- Explicit bulk PR merge:
  - `POST /api/repos/{owner}/{repo}/pulls/bulk-merge`
- PR auto-merge control:
  - `GET|POST|DELETE /api/repos/{owner}/{repo}/pulls/{number}/auto-merge`
- PR checks status API:
  - `GET /api/repos/{owner}/{repo}/pulls/{number}/checks`
- Analytics additions:
  - `GET /api/repos/{owner}/{repo}/analytics/merge-frequency`
  - `GET /api/repos/{owner}/{repo}/analytics/workload`
- Notifications upgrades:
  - smart prioritization: `GET /api/notifications?prioritize=true`
  - blocking filter: `GET /api/notifications?filter=blocking`
  - digest retries/metrics: `POST /api/cron/notification-digests?maxRetries=...`
- Email delivery verification:
  - `POST /api/user/email/test`
- Repository template discovery filters and collaborator visibility:
  - `GET /api/repos/templates?q=&owner=&visibility=`

## Partial areas still open
- Monorepo advanced path scoping
- Full state-specific reviewer enforcement
- CI provider parity and setup UX depth
- Plugin system enhancement
- Advanced notification personalization and routing

See `doc/feature_audit.md` for the full matrix and implementation plan.
