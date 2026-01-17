# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **SDK**: Introduced `@opencodehub/sdk`, a TypeScript Client for programmatically interacting with the OpenCodeHub API.
- **CLI**: Released `opencodehub-cli` (v1.0.1) to npm.
    - Added `och` command globally.
    - Implemented smoke tests for CLI verification.
- **Documentation**:
    - Added comprehensive "Roadmap" to `README.md` for Q2-Q4 2026.
    - Added `docs/publishing.md` guide for CLI release management.
- **Assets**: Updated project logo to SVG format.

### Changed
- **Logs**: Cleaned up production code by removing debug `console.log` statements in:
    - `src/pages/[owner]/[repo]/milestones/index.astro`
    - `src/pages/[owner]/[repo]/settings/deploy-keys.astro`
    - `src/pages/[owner]/[repo]/wiki/index.astro`
    - `src/pages/[owner]/[repo]/actions/index.astro`
- **Repo Links**: Updated all hardcoded GitHub repository URLs to point to `swadhinbiswas/OpencodeHub`.

### Fixed
- **Security**: Fixed Critical Authorization Bypass in Issue Creation API (`issues/index.ts`).
    - Now correctly checks `canReadRepo` before inserting issues.
- **Security**: Fixed Privacy Leak in Collaborators List API (`collaborators/index.ts`).
    - Added permission check to prevent unauthorized users from enumerating members of private repositories.
- **CLI**: Fixed incorrect binary path in `cli/package.json` that prevented global execution.

## [0.1.0] - 2026-01-14
### Added
- Initial release of OpenCodeHub.
- Basic repo management, issue tracking, and PR workflow.
