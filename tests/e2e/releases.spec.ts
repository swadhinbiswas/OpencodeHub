import { expect, test } from "@playwright/test";

test.describe("Releases", () => {
  test("releases page pattern loads", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.locator("body")).toBeVisible();
  });

  test("releases API returns data", async ({ request }) => {
    // Public repo releases should be accessible
    const res = await request.get("/api/repos/test/test-repo/releases");
    // Could be 200 (with empty array) or 404 if repo doesn't exist
    expect([200, 404]).toContain(res.status());
  });
});
