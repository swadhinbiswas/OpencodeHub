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
    const html = page.locator("html");
    const initialClass = await html.getAttribute("class");

    const themeBtn = page
      .locator(
        'button[aria-label*="theme"], button[aria-label*="Theme"], [data-theme-toggle], button:has(svg.lucide-sun), button:has(svg.lucide-moon)',
      )
      .first();

    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(500);
      const newClass = await html.getAttribute("class");
      // Theme class should change (dark ↔ light)
      expect(newClass).not.toBe(initialClass);
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
      const classAfterClick = await page.locator("html").getAttribute("class");

      await page.reload();
      await page.waitForTimeout(500);
      const classAfterReload = await page.locator("html").getAttribute("class");

      expect(classAfterReload).toBe(classAfterClick);
    }
  });
});
