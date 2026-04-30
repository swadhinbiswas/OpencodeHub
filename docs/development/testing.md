# Testing Guide

OpenCodeHub uses **Vitest** for unit and integration testing, and **Playwright** for end-to-end testing.

---

## Test Suite Overview

| Suite | Framework | Location | Count |
|-------|-----------|----------|-------|
| Unit Tests | Vitest | `tests/unit/` | 300+ |
| Integration Tests | Vitest | `tests/integration/` | 100+ |
| Security Tests | Vitest | `tests/security.test.ts` | 20+ |
| E2E Tests | Playwright | `tests/e2e/` | 50+ |
| Load Tests | Custom | `tests/load/` | 5+ |

**Total: 546 tests across 114 test files** (100% passing)

---

## Running Tests

### All Tests

```bash
npm test
# or
bun test
```

### Unit Tests Only

```bash
npm test -- --run tests/unit
```

### Integration Tests Only

```bash
npm test -- --run tests/integration
```

### Specific Test File

```bash
npm test -- --run tests/unit/auth.test.ts
```

### Watch Mode

```bash
npm test -- --watch
```

### With Coverage

```bash
npm run test:coverage
```

### E2E Tests

```bash
npx playwright test
```

Run specific E2E test:
```bash
npx playwright test tests/e2e/login.spec.ts
```

Run with UI mode:
```bash
npx playwright test --ui
```

---

## Test Structure

### Unit Tests

Test individual functions and modules in isolation:

```typescript
// tests/unit/example.test.ts
import { describe, it, expect } from "vitest";
import { myFunction } from "@/lib/example";

describe("myFunction", () => {
  it("returns correct result for valid input", () => {
    expect(myFunction("valid")).toBe("expected");
  });

  it("throws on invalid input", () => {
    expect(() => myFunction("invalid")).toThrow();
  });
});
```

### Integration Tests

Test API routes with mocked database and services:

```typescript
// tests/integration/example-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn().mockResolvedValue({
    userId: "usr_1",
    username: "alice",
  }),
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: mocks.getUserFromRequestMock,
}));

// ... mock database, etc.

describe("GET /api/example", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserFromRequestMock.mockResolvedValue({
      userId: "usr_1",
      username: "alice",
    });
  });

  it("returns 200 for authenticated user", async () => {
    // Test implementation
  });
});
```

### Mock Best Practices

- Use `vi.hoisted()` for mock definitions that must be set up before imports
- Use `vi.clearAllMocks()` in `beforeEach` to clear call history
- Reset mock **implementations** in `beforeEach` if tests change them:
  ```typescript
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.myMock.mockResolvedValue(defaultValue);
  });
  ```
- The `success()` helper wraps API responses as `{ success: true, data: ... }`
  - Access response data via `json.data.*` not `json.*`

---

## Writing New Tests

### 1. Create the Test File

Place tests alongside the code or in `tests/`:

```bash
# Unit test for src/lib/new-feature.ts
touch tests/unit/new-feature.test.ts

# Integration test for src/pages/api/new-route.ts
touch tests/integration/new-route.test.ts
```

### 2. Mock Dependencies

Mock external modules using `vi.mock()`:

```typescript
vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: mockSchema,
}));
```

### 3. Write Test Cases

Cover:
- Happy path (normal operation)
- Authentication failures (401)
- Authorization failures (403)
- Not found (404)
- Validation errors (400)
- Edge cases (empty arrays, null values)

### 4. Run and Verify

```bash
npm test -- --run tests/unit/new-feature.test.ts
```

---

## E2E Testing with Playwright

### Setup

Playwright is configured in `playwright.config.ts`.

### Writing E2E Tests

```typescript
// tests/e2e/login.spec.ts
import { test, expect } from "@playwright/test";

test("user can log in", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="username"]', "testuser");
  await page.fill('input[name="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");
});
```

### Accessibility Testing

```bash
npx playwright test --project=accessibility
```

Uses `@axe-core/playwright` to check for accessibility violations.

---

## Test Commands Reference

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm test -- --run` | Run once (no watch) |
| `npm test -- --watch` | Watch mode |
| `npm test -- --run <pattern>` | Run matching files |
| `npm run test:coverage` | Run with coverage report |
| `npx playwright test` | Run E2E tests |
| `npx playwright test --ui` | Run E2E with UI |
| `npx playwright test --headed` | Run E2E in visible browser |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript check |

---

## CI Integration

Tests run automatically in the CI pipeline:

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --run
      - run: npx playwright test
```

---

## Troubleshooting

### "Module not found" in tests

Ensure the path alias is correct. Use `@/` prefix for src files:
```typescript
import { something } from "@/lib/something"; // Correct
import { something } from "../../lib/something"; // Avoid
```

### "Cannot read properties of undefined" in integration tests

Usually caused by mock drift:
1. Check if `json.data.*` is used for routes returning `success()`
2. Ensure mock implementations are reset in `beforeEach`
3. Verify all mocked modules are properly hoisted

### Slow tests

- Use `vi.useFakeTimers()` for time-dependent code
- Mock heavy operations (database queries, file I/O)
- Use `--run` flag instead of watch mode in CI

---

## See Also

- [Contributing Guide](contributing.md)
- [Architecture](architecture.md)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
