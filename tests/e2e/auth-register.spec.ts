import { expect, test } from "@playwright/test";

test.describe("Authentication - Register", () => {
  test("register page loads", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("form")).toBeVisible();
  });

  test("shows validation errors for empty form", async ({ page }) => {
    await page.goto("/register");
    await page.click('button[type="submit"]');
    await expect(
      page.locator("text=required").or(page.locator("[role=alert]")).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("register with valid data", async ({ page }) => {
    const ts = Date.now();
    await page.goto("/register");
    await page.fill('input[name="username"]', `e2euser${ts}`);
    await page.fill('input[name="email"]', `e2e${ts}@test.com`);
    await page.fill('input[name="password"]', `Test1234!`);
    if (await page.locator('input[name="displayName"]').isVisible()) {
      await page.fill('input[name="displayName"]', `E2E User ${ts}`);
    }
    await page.click('button[type="submit"]');
    // Should redirect to dashboard or show success
    await page.waitForURL(/\/(dashboard|explore|\/)/, { timeout: 10000 });
  });
});
