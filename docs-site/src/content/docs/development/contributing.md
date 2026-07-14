---
title: "Contributing Guide"
---

Thank you for your interest in contributing to OpenCodeHub! We welcome contributions from everyone.

## Local Development Setup

### Prerequisites

- **Node.js** 20+ (or Bun 1.0+)
- **Docker** (for PostgreSQL and Redis)
- **Git** 2.30+

### Step 1: Clone & Install

```bash
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpencodeHub
npm install
```

### Step 2: Database Setup

Start PostgreSQL and Redis:

```bash
docker-compose up -d postgres redis
```

Copy and configure environment:

```bash
cp .env.example .env
# The default .env.example works with docker-compose services
```

Push schema to database:

```bash
npm run db:push
```

### Step 3: Seed & Run

```bash
# Create admin user
bun run scripts/seed-admin.ts

# Start dev server
npm run dev
```

Visit `http://localhost:4321`.

## Running Tests

We use **Vitest** for unit/integration tests and **Playwright** for E2E tests.

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run specific test file
npx vitest run tests/unit/auth.test.ts

# Watch mode
npx vitest --watch
```

**Current status: 546 tests passing across 114 test files (100% pass rate)**

## Code Quality

```bash
npm run lint          # Astro check
npm run typecheck     # TypeScript check
npm run test          # Test suite
```

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add new login page`
- `fix: resolve crash on startup`
- `docs: update troubleshooting guide`
- `refactor: simplify permission check`
- `test: add coverage for merge queue`

## Submitting a Pull Request

1. **Fork** the repository
2. Create a **feature branch**: `git checkout -b feat/my-feature`
3. Make your changes with tests
4. Run `npm run test` and `npm run typecheck` to verify
5. Commit with a conventional commit message
6. Push to your fork
7. Open a **Pull Request** against `main`
8. Wait for CI checks to pass

## Project Structure

```
src/
├── pages/          # Astro file-based routing
│   ├── api/        # REST API routes (175+ endpoints)
│   └── [owner]/[repo]/  # Repository pages
├── lib/            # Core business logic (130+ modules)
├── db/             # Database layer (Drizzle ORM)
│   ├── schema/     # 38 schema table definitions
│   └── index.ts    # DB connection factory
├── components/     # React components
├── runner/         # CI runner (Docker executor)
└── middleware.ts    # Auth, rate limit, CSRF

cli/
├── src/commands/   # CLI command groups (20+)
└── src/lib/        # CLI utilities

docs-site/          # This documentation site (Starlight)
```

## Areas for Contribution

- **CI/CD Features**: Matrix builds, caching, workflow templates
- **Package Registry**: npm and Docker registry enhancements
- **AI Review**: New provider integrations, review quality improvements
- **CLI**: New commands, better error messages
- **Tests**: Increase coverage, especially for edge cases
- **Documentation**: Tutorials, guides, API examples
- **Accessibility**: WCAG compliance, keyboard navigation

Thank you for helping build OpenCodeHub!
