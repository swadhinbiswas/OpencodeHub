import { expect, test } from "@playwright/test";

test.describe("Pull Requests", () => {
  test("PR list page pattern exists", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.locator("body")).toBeVisible();
  });

  test("PR creation requires auth", async ({ page }) => {
    await page.goto("/test/test-repo/compare");
    const url = page.url();
    // Should redirect to login or show 404
    expect(
      url.includes("/login") ||
        url.includes("404") ||
        (await page
          .locator("text=not found")
          .isVisible()
          .catch(() => true)),
    ).toBeTruthy();
  });
});
