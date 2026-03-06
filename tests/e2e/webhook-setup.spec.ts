import { expect, test } from "@playwright/test";

test.describe("Webhook Setup", () => {
  test("webhook settings require auth", async ({ page }) => {
    await page.goto("/test/test-repo/settings/webhooks");
    const url = page.url();
    expect(
      url.includes("/login") ||
        page.url().includes("404") ||
        (await page
          .locator("text=not found")
          .or(page.locator("text=denied"))
          .first()
          .isVisible()
          .catch(() => false)),
    ).toBeTruthy();
  });

  test("webhook API requires auth", async ({ request }) => {
    const res = await request.get("/api/repos/test/test-repo/webhooks");
    expect([401, 403, 404]).toContain(res.status());
  });
});
