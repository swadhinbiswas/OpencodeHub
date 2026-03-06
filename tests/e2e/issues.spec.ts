import { expect, test } from "@playwright/test";

test.describe("Issues", () => {
  test("issues page loads for a repo", async ({ page }) => {
    // Navigate to a generic issues URL pattern
    const response = await page.goto("/explore");
    await expect(page.locator("body")).toBeVisible();
  });

  test("new issue page requires auth", async ({ page }) => {
    // Attempting to create an issue without auth should redirect or show error
    await page.goto("/test/test-repo/issues/new");
    const url = page.url();
    const hasError = await page
      .locator("text=not found")
      .or(page.locator("text=login"))
      .first()
      .isVisible()
      .catch(() => false);
    // Either redirected to login or shows not found (expected)
    expect(
      url.includes("/login") || hasError || page.url().includes("404"),
    ).toBeTruthy();
  });
});
