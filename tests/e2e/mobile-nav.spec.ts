import { expect, test } from "@playwright/test";

test.describe("Mobile Navigation", () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test("mobile menu button is visible", async ({ page }) => {
    await page.goto("/");
    const menuBtn = page.locator(
      'button[aria-label*="menu"], button[aria-label*="Menu"], [data-mobile-menu], button.md\\:hidden, button.lg\\:hidden',
    );
    await expect(menuBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking menu button shows navigation", async ({ page }) => {
    await page.goto("/");
    const menuBtn = page
      .locator(
        'button[aria-label*="menu"], button[aria-label*="Menu"], [data-mobile-menu], button.md\\:hidden, button.lg\\:hidden',
      )
      .first();

    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await page.waitForTimeout(500);
      // Scope to the mobile navigation dialog specifically
      const navLinks = page.locator('[aria-label="Mobile navigation menu"] a');
      await expect(navLinks.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("page is responsive at mobile width", async ({ page }) => {
    await page.goto("/");
    // No horizontal scrollbar
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test("login page is mobile-friendly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("form")).toBeVisible();
    // Form should fit within viewport
    const formBox = await page.locator("form").boundingBox();
    if (formBox) {
      expect(formBox.width).toBeLessThanOrEqual(375);
    }
  });
});
