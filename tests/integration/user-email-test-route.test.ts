import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendTestEmailMock, isSmtpConfiguredMock } = vi.hoisted(() => ({
  sendTestEmailMock: vi.fn(async () => true),
  isSmtpConfiguredMock: vi.fn(() => true),
}));

vi.mock("@/lib/email", () => ({
  sendTestEmail: sendTestEmailMock,
  isSmtpConfigured: isSmtpConfiguredMock,
}));

import { POST as emailTestPost } from "@/pages/api/user/email/test";

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("user email test route", () => {
  beforeEach(() => {
    sendTestEmailMock.mockReset();
    isSmtpConfiguredMock.mockReset();
    sendTestEmailMock.mockResolvedValue(true);
    isSmtpConfiguredMock.mockReturnValue(true);
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await emailTestPost({
      locals: {},
      request: new Request("http://localhost/api/user/email/test", { method: "POST" }),
    } as any);

    expect(response.status).toBe(401);
  });

  it("uses user email and dryRun=true by default", async () => {
    const response = await emailTestPost({
      locals: { user: { id: "user-1", email: "user@example.com" } },
      request: new Request("http://localhost/api/user/email/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.dryRun).toBe(true);
    expect(body?.data?.to).toBe("user@example.com");
    expect(sendTestEmailMock).toHaveBeenCalledWith({ to: "user@example.com", dryRun: true });
  });

  it("supports explicit destination and non-dry run", async () => {
    const response = await emailTestPost({
      locals: { user: { id: "user-1", email: "user@example.com" } },
      request: new Request("http://localhost/api/user/email/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: "ops@example.com", dryRun: false }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.dryRun).toBe(false);
    expect(body?.data?.to).toBe("ops@example.com");
    expect(sendTestEmailMock).toHaveBeenCalledWith({ to: "ops@example.com", dryRun: false });
  });
});
