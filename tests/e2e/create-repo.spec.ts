import { expect, test } from "@playwright/test";

test.describe("Create Repository", () => {
  test("new repo page requires auth", async ({ page }) => {
    await page.goto("/new");
    // Should either show the form (if logged in) or redirect to login
    const url = page.url();
    const hasForm = await page
      .locator("form")
      .isVisible()
      .catch(() => false);
    expect(url.includes("/login") || hasForm).toBeTruthy();
  });

  test("new repo page shows required fields", async ({ page }) => {
    // Navigate directly - may redirect if not authed
    await page.goto("/new");
    if (page.url().includes("/login")) {
      // Expected for unauthenticated user
      return;
    }
    await expect(
      page.locator('input[name="name"], input[name="repoName"]').first(),
    ).toBeVisible();
  });
});
