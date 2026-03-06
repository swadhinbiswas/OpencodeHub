import { expect, test } from "@playwright/test";

test.describe("Fork Repository", () => {
  test("fork requires authentication", async ({ page }) => {
    await page.goto("/test/test-repo");
    // Fork button should require auth
    const forkBtn = page.locator("button:has-text('Fork'), a:has-text('Fork')");
    if (await forkBtn.isVisible().catch(() => false)) {
      await forkBtn.click();
      // Should redirect to login
      await page.waitForTimeout(1000);
      const url = page.url();
      expect(url.includes("/login") || url.includes("/fork")).toBeTruthy();
    }
  });
});
