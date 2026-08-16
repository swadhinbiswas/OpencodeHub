# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-08-15

### 🚀 Production Readiness Release
- **Full-stack E2E proof** (`scripts/e2e-proof.sh`, 20 checks): real git push → workflow → CI success (Docker), PR + squash merge, OAuth provider flow, org invites + transfer, org-owned repo APIs — all green against Postgres + Redis.
- **Git protocol fixes** (found by the proof): post-receive hooks now fire (stdin newline + capability stripping), receive-pack status on sideband band 1 with nested pkt-line framing + inner flush — real `git push` completes cleanly.
- **CI engine**: parallel job waves with `needs` ordering, matrix expansion, cron scheduler, GITHUB_OUTPUT/GITHUB_ENV, repo secrets injection, Docker image auto-pull, speculative-build CI execution, docker actions (`uses: docker://`) on self-hosted runners, action resolver for composite actions + checkout.
- **Configuration**: `.env` no longer shadows real environment variables; Redis uses static imports (distributed rate limiting + locks actually active).
- **Collaboration**: issue assignees/milestones/custom-fields/workflow transitions wired, PR labels + assignees + requested-reviewers, draft PRs, merge-method selection, review-thread resolution, @mentions, issue templates, real contribution graph, watch/unwatch.
- **Security**: OAuth provider mode (authorization-code + refresh-token grants, userinfo), fine-grained PAT scopes with implication, GitHub/Google login, org SAML config, org-aware permission resolution everywhere.
- **Organizations**: CRUD + pages, member invites, teams, repo transfer (API + UI), org-owned repos work across all routes/pages.
- **DX**: GraphQL expansion (issues/orgs/labels mutations), OpenAPI 100% coverage (275 routes) with an idempotent generator + CI gate, npm registry protocol completion (login/whoami/publish/metadata/tarballs).
- **Observability**: per-request correlation IDs bound to every log line; OTLP transport for Grafana Cloud.
- **Quality**: authz matrix suite (43 cases, scope-implication fix), multi-instance chaos suite, load baseline green (p95 ≤136ms at 20-concurrency), DR drills, wiring-audit gate, contract/smoke lanes.
- **CLI**: `opencodehub-cli` 1.2.0.

## [1.1.2] - 2026-08-10

### 🛡️ Quality Gates (Phase 0 of production-parity plan)
- **CI lanes**: Added real `Contract Tests (Lane: contract)` and `Smoke Tests (Lane: smoke)` jobs; branch ruleset now requires job names that exist.
- **Contract suite**: New `tests/contract/` — pkt-line protocol, webhook HMAC (GitHub-vector pinned), workflow trigger semantics, OpenAPI shape (27 tests).
- **Smoke suite**: New `tests/smoke/` — boot-critical module wiring (env validation, storage, db, auth, git) (6 tests).
- **Coverage**: vitest now emits `coverage-summary.json` + `lcov.info`; the CI threshold check is no longer a silent no-op.
- **Disaster-recovery drills**: Implemented `drill:backup-restore`, `drill:redis`, `drill:postgres` scripts that the weekly-drills workflow was already calling.
- **Versioning**: Root package unified to 1.1.2 (was 1.0.0), matching the CLI.
- **GitHub-Actions glob fix**: `**` in branch/path filters now spans directories correctly (previously collapsed to a single level); `on: workflow_dispatch` shorthand triggers now work; `!`-negation in `paths:` filters is honored.
- **OpenAPI**: Documented previously-missing core paths (`/repos`, `/repos/{owner}/{repo}/issues`, `/issues/{number}`, `/branches`, `/labels`).

## [1.1.0] - 2026-01-22

### 📚 Documentation (Major Overhaul)
- **Structure**: Reorganized `docs/` into a comprehensive knowledge base (`getting-started`, `guides`, `tutorials`, `api`, `administration`).
- **Visuals**:
    - Added **Mermaid.js** C4 Architecture diagrams.
    - Added **Git Graph** diagrams for workflow comparisons.
    - Created custom SVGs for `stack-workflow` and `architecture`.
- **New Guides**:
    - **Production Installation**: Detailed hardware specs, Nginx config, and go-live checklist.
    - **API Reference**: Swagger-style documentation with JSON examples and parameter tables.
    - **Troubleshooting**: Solutions for common errors (Docker, 403s, Database).
    - **CLI Reference**: Unified command list for `opencodehub-cli`.
    - **Glossary**: Definitions for core terms like "Stacked PRs" and "Merge Queue".

### 💻 CLI (`v1.1.0`)
- **UI Polish**:
    - Implemented "Dracula" theme for consistent coloring.
    - Added ASCII art logo and gradient banners.
    - Replaced raw logs with animated spinners (`ora`) and progress bars.
    - Added "Success Boxes" for clearer operation summaries.
- **Commands**:
    - `och stack view`: Now displays a visual ASCII tree of the current stack.
    - `och push`: Shows PR compilation status and links.

### 🛡 Security & Fixes
- **Authorization**: Fixed critical bypass in `issues/index.ts` and `collaborators/index.ts`.
- **Fixes**: Resolved incorrect binary path in CLI package.json.
- **Repo Links**: Updated hardcoded GitHub links to the official repository.

## [0.2.0] - 2026-01-21

### Added
- **Cloudflare R2 Storage Integration**:
    - Full support for Cloudflare R2 as a repository storage backend.
    - Configure with `STORAGE_TYPE=s3` and R2-specific environment variables.
    - Repositories are automatically uploaded to R2 on creation.
    - Repositories are automatically deleted from R2 on deletion.
    - Git clone/push operations now work with cloud-stored repositories.
- **UI Modernization**:
    - Added global toast notification system using `sonner` package.
    - Created `src/components/ui/sonner.tsx` Shadcn UI wrapper.
    - Added `<Toaster />` component to `BaseLayout.astro` for app-wide notifications.
    - New `RepoSettings.tsx` React component for repository settings management.
    - Replaced native `alert()` and `confirm()` with Shadcn `AlertDialog` components.
- **New Pages & Features**:
    - `src/pages/insights.astro` - Platform-wide analytics dashboard.
    - `src/pages/merge-queue.astro` - Merge queue management interface.
    - `src/pages/settings/ai-review-rules.astro` - AI code review configuration.
    - `src/pages/settings/automations.astro` - Workflow automation settings.
    - `src/pages/settings/notification-preferences.astro` - User notification settings.
    - `src/pages/api/user/notification-preferences.ts` - New API endpoint.

### Changed
- **Database**: Migrated all schema files to use `pgTable` with PostgreSQL types.
- **API Routes**: Standardized logging and error handling across 60+ API files.
- **Drizzle ORM**: Automated TypeScript casting fixes across the codebase.
- **Repository Creation**: Made cloud storage sync asynchronous for faster API responses.
- **Git Operations**: Refactored `initRepository` to separate cloud storage concerns from git initialization.

### Fixed
- **Cloud Storage**: Fixed `S3StorageAdapter` incorrectly prepending base path to S3 keys (caused `NoSuchKey` errors).
- **Cloud Storage**: Fixed `uploadRepoToStorage` uploading 0 files due to duplicate `initRepoInStorage` calls.
- **Cloud Storage**: Fixed `triggerRepoWorkflows` failing with "directory does not exist" for R2-backed repos.
- **Cloud Storage**: Fixed repository deletion not cleaning up objects from R2 storage.
- **Git Backend**: Fixed `git clone` and `git push` operations for cloud-stored repositories.
- **Git Operations**: Added `resolveRepoPath` for resolving logical cloud paths to local temp directories.
- **Admin Pages**: Fixed TypeScript errors in `admin/settings.astro` and `admin/users.astro`.
- **Tree Pages**: Fixed layout issues by replacing missing `RepositoryLayout.astro`.
- **API**: Fixed Drizzle ORM "count" property errors in admin pages.
- **Stacks API**: Fixed TypeScript type limitations.

### Security
- **Postgres Support**: Full PostgreSQL support with `node-postgres` driver.
- **Environment Variables**: Improved `isCloudStorage()` detection using `STORAGE_TYPE` env directly.

## [0.1.0] - 2026-01-14
### Added
- Initial release of OpenCodeHub.
- Basic repo management, issue tracking, and PR workflow.

