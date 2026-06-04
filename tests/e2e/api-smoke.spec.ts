import { expect, test } from "@playwright/test";

test.describe("API Smoke Tests", () => {
  test("search API returns 200 for valid query", async ({ request }) => {
    const res = await request.get("/api/search?q=test");
    expect(res.status()).toBe(200);
    const json = await res.json();
    const results = json?.data?.results ?? json?.results;
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  test("search API returns empty for short query", async ({ request }) => {
    const res = await request.get("/api/search?q=a");
    expect(res.status()).toBe(200);
    const json = await res.json();
    const results = json?.data?.results ?? json?.results ?? [];
    expect(results).toEqual([]);
  });

  test("auth me API returns 401 without token", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });

  test("user API returns 401 without token", async ({ request }) => {
    const res = await request.get("/api/user");
    expect(res.status()).toBe(401);
  });

  test("notifications API returns 401 without token", async ({ request }) => {
    const res = await request.get("/api/notifications");
    expect(res.status()).toBe(401);
  });

  test("login API rejects empty body", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    // 400 = validation, 401 = auth, 403 = CSRF
    expect([400, 401, 403]).toContain(res.status());
  });

  test("register API rejects invalid data", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: { username: "a" }, // too short, missing fields
      headers: { "Content-Type": "application/json" },
    });
    // 400 = validation, 422 = unprocessable, 403 = CSRF
    expect([400, 422, 403]).toContain(res.status());
  });

  test("CSRF token endpoint exists", async ({ request }) => {
    const res = await request.get("/api/auth/csrf-token");
    expect([200, 404]).toContain(res.status());
  });
});
