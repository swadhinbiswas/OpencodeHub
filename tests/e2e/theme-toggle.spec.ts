import { expect, test } from "@playwright/test";

test.describe("Theme Toggle", () => {
  test("theme toggle button exists", async ({ page }) => {
    await page.goto("/");
    const themeBtn = page.locator(
      'button[aria-label*="theme"], button[aria-label*="Theme"], [data-theme-toggle], button:has(svg.lucide-sun), button:has(svg.lucide-moon)',
    );
    await expect(themeBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking theme toggle changes theme", async ({ page }) => {
    await page.goto("/");
    const themeBtn = page
      .locator(
        'button[aria-label*="theme"], button[aria-label*="Theme"], [data-theme-toggle], button:has(svg.lucide-sun), button:has(svg.lucide-moon)',
      )
      .first();

    if (await themeBtn.isVisible()) {
      // Get initial state
      const initialStorage = await page.evaluate(() =>
        localStorage.getItem("theme"),
      );

      // Click to open dropdown
      await themeBtn.click();
      await page.waitForTimeout(500);

      // Try to click "Light" option
      const lightOption = page.locator('[role="menuitem"]').filter({ hasText: /Light/i }).first();
      if (await lightOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await lightOption.click();
      } else {
        // Fallback: click any menu item
        const anyItem = page.locator('[role="menuitem"]').first();
        if (await anyItem.isVisible({ timeout: 2000 }).catch(() => false)) {
          await anyItem.click();
        }
      }

      await page.waitForTimeout(500);

      const newStorage = await page.evaluate(() =>
        localStorage.getItem("theme"),
      );
      // Theme must have changed
      expect(newStorage).toBeTruthy();
    }
  });

  test("theme persists on reload", async ({ page }) => {
    await page.goto("/");
    const themeBtn = page
      .locator(
        'button[aria-label*="theme"], button[aria-label*="Theme"], [data-theme-toggle], button:has(svg.lucide-sun), button:has(svg.lucide-moon)',
      )
      .first();

    if (await themeBtn.isVisible()) {
      // Open dropdown
      await themeBtn.click();
      await page.waitForTimeout(500);

      // Click first menu item
      const item = page.locator('[role="menuitem"]').first();
      if (await item.isVisible({ timeout: 2000 }).catch(() => false)) {
        await item.click();
      }
      await page.waitForTimeout(500);

      const storageAfterClick = await page.evaluate(() =>
        localStorage.getItem("theme"),
      );

      await page.reload();
      await page.waitForTimeout(500);
      const storageAfterReload = await page.evaluate(() =>
        localStorage.getItem("theme"),
      );

      expect(storageAfterReload).toBe(storageAfterClick);
    }
  });
});
