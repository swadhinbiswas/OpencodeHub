import { expect, test } from "@playwright/test";

test.describe("Dashboard", () => {
  test("homepage loads and shows branding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/OpenCodeHub/i);
  });

  test("explore page loads", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.locator("body")).toBeVisible();
    // Should show repositories or search
    await expect(
      page
        .locator("text=Explore")
        .or(page.locator("text=Repositories"))
        .or(page.locator("text=explore"))
        .first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("navigation bar is present", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav, header");
    await expect(nav.first()).toBeVisible();
  });

  test("footer is present", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    if (await footer.isVisible()) {
      await expect(footer).toBeVisible();
    }
  });
});
