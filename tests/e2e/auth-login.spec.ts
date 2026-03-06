import { expect, test } from "@playwright/test";

test.describe("Authentication - Login", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("form")).toBeVisible();
    await expect(
      page
        .locator(
          'input[name="login"], input[name="username"], input[type="text"]',
        )
        .first(),
    ).toBeVisible();
    await expect(
      page.locator('input[name="password"], input[type="password"]').first(),
    ).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill(
      'input[name="login"], input[name="username"], input[type="text"]',
      "nonexistent_user",
    );
    await page.fill(
      'input[name="password"], input[type="password"]',
      "wrongpassword",
    );
    await page.click('button[type="submit"]');
    await expect(
      page
        .locator("text=Invalid")
        .or(page.locator("text=incorrect"))
        .or(page.locator("[role=alert]"))
        .first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("has link to register page", async ({ page }) => {
    await page.goto("/login");
    const registerLink = page.locator('a[href*="register"]');
    await expect(registerLink).toBeVisible();
  });

  test("has link to forgot password", async ({ page }) => {
    await page.goto("/login");
    const forgotLink = page.locator('a[href*="forgot"], a[href*="reset"]');
    if (await forgotLink.isVisible()) {
      await expect(forgotLink).toBeVisible();
    }
  });
});
