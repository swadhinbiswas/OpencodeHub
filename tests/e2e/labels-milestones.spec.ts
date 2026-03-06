import { expect, test } from "@playwright/test";

test.describe("Labels and Milestones", () => {
  test("labels page pattern", async ({ page }) => {
    await page.goto("/test/test-repo/labels");
    await expect(page.locator("body")).toBeVisible();
  });

  test("milestones page pattern", async ({ page }) => {
    await page.goto("/test/test-repo/milestones");
    await expect(page.locator("body")).toBeVisible();
  });
});
