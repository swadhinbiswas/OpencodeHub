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
      const initialLabel = await themeBtn.getAttribute("aria-label");
      const initialStorage = await page.evaluate(() =>
        localStorage.getItem("theme"),
      );
      await themeBtn.click();
      await page.waitForTimeout(500);
      const newLabel = await themeBtn.getAttribute("aria-label");
      const newStorage = await page.evaluate(() =>
        localStorage.getItem("theme"),
      );
      // Either the aria-label or the persisted theme must change
      expect(newLabel !== initialLabel || newStorage !== initialStorage).toBe(
        true,
      );
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
      await themeBtn.click();
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
