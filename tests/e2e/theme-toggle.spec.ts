import { expect, test } from "@playwright/test";

test.describe("Theme Toggle", () => {
  test("theme toggle button exists", async ({ page }) => {
    await page.goto("/");
    const themeBtn = page.locator('button[aria-label*="theme"], button[aria-label*="Theme"], [data-theme-toggle], button:has(svg.lucide-palette)').first();
    await expect(themeBtn).toBeVisible({ timeout: 5000 });
  });

  test("clicking theme toggle changes theme", async ({ page }) => {
    await page.goto("/");
    const themeBtn = page.locator('button[aria-label*="theme"], button[aria-label*="Theme"], [data-theme-toggle], button:has(svg.lucide-palette)').first();

    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      const lightOption = page.locator('[role="menuitem"]').filter({ hasText: /Light/i }).first();
      await expect(lightOption).toBeVisible({ timeout: 5000 });
      await lightOption.click();

      await page.waitForFunction(
        () => localStorage.getItem("theme") === "light",
        { timeout: 5000 },
      );
      const newStorage = await page.evaluate(() => localStorage.getItem("theme"));
      expect(newStorage).toBe("light");
    }
  });

  test("theme persists on reload", async ({ page }) => {
    await page.goto("/");
    const themeBtn = page.locator('button[aria-label*="theme"], button[aria-label*="Theme"], [data-theme-toggle], button:has(svg.lucide-palette)').first();

    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      const darkOption = page.locator('[role="menuitem"]').filter({ hasText: /Default Dark/i }).first();
      await expect(darkOption).toBeVisible({ timeout: 5000 });
      await darkOption.click();

      await page.waitForFunction(
        () => localStorage.getItem("theme") !== null,
        { timeout: 5000 },
      );
      const storageAfterClick = await page.evaluate(() => localStorage.getItem("theme"));

      await page.reload();
      await page.waitForFunction(
        () => document.readyState === "complete",
        { timeout: 10000 },
      );
      const storageAfterReload = await page.evaluate(() => localStorage.getItem("theme"));

      expect(storageAfterReload).toBe(storageAfterClick);
    }
  });
});
