import { expect, test } from "@playwright/test";

test.describe("Compare View", () => {
  test("compare page pattern exists", async ({ page }) => {
    await page.goto("/test/test-repo/compare");
    const status = await page.locator("body").isVisible();
    expect(status).toBe(true);
  });
});
