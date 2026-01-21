# Contributing Guide

Thank you for your interest in contributing to OpenCodeHub! We welcome contributions from everyone.

## 🛠 Local Development Setup

To contribute code, you need to set up the project locally.

### Prerequisites

- **Node.js**: v18 or v20 (LTS).
- **Bun**: v1.0+ (Our package manager/runner).
- **Docker**: For running the database locally.

### Step 1: Clone & Install

```bash
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpencodeHub

# Install dependencies (fast!)
bun install
```

### Step 2: Database Setup

Start a local Postgres and Redis instance using Docker:

```bash
docker-compose up -d postgres redis
```

Copy the environment config:
```bash
cp .env.example .env
```
*Note: The default `.env.example` is pre-configured to work with the docker-compose services.*

Push the schema to the database:
```bash
bun db:push
```

### Step 3: Run the App

Start the development server:

```bash
bun dev
```

Visit `http://localhost:3000`.

---

## 🧪 Running Tests

We use **Vitest** for unit tests. Use TDD!

```bash
# Run all tests
bun test

# Run specific test file
bun test user.test.ts

# Watch mode
bun test --watch
```

---

## 🎨 Code Style

We use **ESLint** and **Prettier** to enforce code style.

- **Lint**: `bun lint`
- **Format**: `bun format`

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

- `feat: add new login page`
- `fix: resolve crash on startup`
- `docs: update troubleshooting guide`

---

## 🚀 Submitting a Pull Request

1. **Fork** the repository.
2. Create a **feature branch**: `git checkout -b feat/my-feature`.
3. Commit your changes.
4. Push to your fork.
5. Open a **Pull Request**.
6. Wait for CI checks to pass.
7. A team member will review your code!

Thank you for helping build OpenCodeHub! ❤️
