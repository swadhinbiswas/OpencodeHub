---
title: "Testing Guide"
---


OpenCodeHub uses **Vitest** for unit testing and **Playwright** for end-to-end testing.

## Running Unit Tests

```bash
bun test
# or
npm test
```

This runs all tests located in `src/**/*.test.ts`.

## Running E2E Tests

```bash
npx playwright test
```

## Writing Tests

We encourage TDD. When adding a new feature:
1. Create a `feature.test.ts` file.
2. Write a failing test case.
3. Implement the feature.
4. Verify the test passes.
