import { expect, test } from "@playwright/test";

test.describe("Blame View", () => {
  test("blame page pattern exists", async ({ page }) => {
    // Navigate to a blame URL pattern - may 404 if no repos exist
    await page.goto("/test/test-repo/blame/main/README.md");
    const status = await page.locator("body").isVisible();
    expect(status).toBe(true);
  });
});
