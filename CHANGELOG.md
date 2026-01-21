# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

