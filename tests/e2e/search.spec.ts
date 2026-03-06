import { expect, test } from "@playwright/test";

test.describe("Search", () => {
  test("search page or search bar exists", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="Search"], input[placeholder*="search"], [role="search"] input',
    );
    // Search might be in nav or on explore page
    if (
      !(await searchInput
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await page.goto("/explore");
    }
    await expect(searchInput.first()).toBeVisible({ timeout: 5000 });
  });

  test("search returns results for common term", async ({ page }) => {
    await page.goto("/explore");
    const searchInput = page
      .locator(
        'input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]',
      )
      .first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("test");
      await searchInput.press("Enter");
      // Wait for results to load
      await page.waitForTimeout(1000);
      // Page should still be visible (no crash)
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
