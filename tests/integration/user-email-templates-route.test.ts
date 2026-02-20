import { describe, expect, it } from "vitest";
import { GET as templatesGet, POST as templatesPost } from "@/pages/api/user/email/templates";

async function json(response: Response): Promise<any> {
  return response.json();
}

describe("user email templates route", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await templatesGet({ locals: {} } as any);
    expect(response.status).toBe(401);
  });

  it("lists templates and renders preview", async () => {
    const listResponse = await templatesGet({ locals: { user: { id: "user-1" } } } as any);
    const listBody = await json(listResponse);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listBody?.data?.templates)).toBe(true);
    expect(listBody?.data?.templates?.length).toBeGreaterThan(0);

    const previewResponse = await templatesPost({
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/user/email/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateId: "pr_opened",
          variables: { number: 42, title: "Add tests", author: "alice" },
        }),
      }),
    } as any);

    const previewBody = await json(previewResponse);
    expect(previewResponse.status).toBe(200);
    expect(previewBody?.data?.preview?.subject).toContain("PR #42 opened");
    expect(previewBody?.data?.preview?.missingVariables?.length).toBe(0);
  });
});
