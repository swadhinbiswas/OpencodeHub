import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Inherit the parent process env so CI can inject DATABASE_URL, JWT_SECRET,
      // SITE_URL, etc. without us having to mirror them here.
      ...process.env,
      // E2E-specific overrides: bypass security middleware so tests don't get
      // rate-limited, and pin the site URL to the dev server so the
      // pre-receive git hook can reach it.
      RATE_LIMIT_SKIP_DEV: 'true',
      CSRF_SKIP_DEV: 'true',
      SITE_URL: 'http://localhost:4321',
      INTERNAL_HOOK_SECRET:
        process.env.INTERNAL_HOOK_SECRET ||
        'f387ae7ad3fb3493993a14574e8f0f28e2f745248d69168f8d84028df2ae74fc',
    },
  },
});
