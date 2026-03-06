import { expect, test } from "@playwright/test";

test.describe("Notifications", () => {
  test("notifications API requires auth", async ({ request }) => {
    const res = await request.get("/api/notifications");
    expect(res.status()).toBe(401);
  });

  test("notifications page requires auth", async ({ page }) => {
    await page.goto("/notifications");
    const url = page.url();
    expect(
      url.includes("/login") ||
        (await page
          .locator("text=login")
          .or(page.locator("text=Sign in"))
          .first()
          .isVisible()
          .catch(() => false)) ||
        page.url().includes("404"),
    ).toBeTruthy();
  });
});
