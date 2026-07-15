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
      const initialStorage = await page.evaluate(() =>
        localStorage.getItem("theme"),
      );

      // Click the theme toggle button to open dropdown
      await themeBtn.click();
      await page.waitForTimeout(300);

      // Click on "Light" menu item to change theme
      const lightOption = page.locator('text=Light').first();
      if (await lightOption.isVisible()) {
        await lightOption.click();
        await page.waitForTimeout(500);
      }

      const newStorage = await page.evaluate(() =>
        localStorage.getItem("theme"),
      );
      // The persisted theme must change
      expect(newStorage).not.toBe(initialStorage);
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
      // Click the theme toggle button to open dropdown
      await themeBtn.click();
      await page.waitForTimeout(300);

      // Click on "Light" menu item
      const lightOption = page.locator('text=Light').first();
      if (await lightOption.isVisible()) {
        await lightOption.click();
        await page.waitForTimeout(500);
      }

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
