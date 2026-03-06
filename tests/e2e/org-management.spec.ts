import { expect, test } from "@playwright/test";

test.describe("Organization Management", () => {
  test("org creation requires auth", async ({ page }) => {
    await page.goto("/orgs/new");
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

  test("org members API requires auth", async ({ request }) => {
    const res = await request.get("/api/orgs/test-org/members");
    expect([401, 403, 404]).toContain(res.status());
  });
});
