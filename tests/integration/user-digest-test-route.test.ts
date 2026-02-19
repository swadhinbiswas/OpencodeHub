import { beforeEach, describe, expect, it, vi } from "vitest";

const { runUserDigestMock } = vi.hoisted(() => ({
  runUserDigestMock: vi.fn(async () => ({
    sent: true,
    dryRun: true,
    period: "daily",
    itemCount: 3,
    attempts: 0,
  })),
}));

vi.mock("@/lib/chat-notifications", () => ({
  runUserDigest: runUserDigestMock,
}));

import { POST as testDigestPost } from "@/pages/api/user/notification-digests/test";

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("user digest test route", () => {
  beforeEach(() => {
    runUserDigestMock.mockResolvedValue({
      sent: true,
      dryRun: true,
      period: "daily",
      itemCount: 3,
      attempts: 0,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await testDigestPost({
      locals: {},
      request: new Request("http://localhost/api/user/notification-digests/test", {
        method: "POST",
      }),
    } as any);

    expect(response.status).toBe(401);
  });

  it("runs digest test with dryRun true by default", async () => {
    const response = await testDigestPost({
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/user/notification-digests/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.sent).toBe(true);
    expect(runUserDigestMock).toHaveBeenCalledWith({
      userId: "user-1",
      dryRun: true,
      period: undefined,
      maxRetries: undefined,
    });
  });
});
