import { expect, test } from "@playwright/test";

test.describe("Admin Panel", () => {
  test("admin page requires auth", async ({ page }) => {
    await page.goto("/admin");
    const url = page.url();
    // Should redirect to login or show forbidden
    expect(
      url.includes("/login") ||
        (await page
          .locator("text=Forbidden")
          .or(page.locator("text=denied"))
          .first()
          .isVisible()
          .catch(() => false)) ||
        (await page
          .locator("text=Login")
          .first()
          .isVisible()
          .catch(() => false)),
    ).toBeTruthy();
  });

  test("admin API requires admin role", async ({ request }) => {
    const res = await request.get("/api/admin/stats");
    // Should be 401 or 403
    expect([401, 403]).toContain(res.status());
  });
});
