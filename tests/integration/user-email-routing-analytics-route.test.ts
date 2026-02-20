import { beforeEach, describe, expect, it, vi } from "vitest";

const { isSmtpConfiguredMock, fakeSchema } = vi.hoisted(() => ({
  isSmtpConfiguredMock: vi.fn(() => true),
  fakeSchema: {
    notificationPreferences: { userId: {}, repositoryId: {}, eventType: {}, id: {}, emailEnabled: {}, updatedAt: {} },
    emailDigestSettings: { userId: {} },
    notifications: { userId: {}, isRead: {}, isArchived: {}, createdAt: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/email", () => ({
  isSmtpConfigured: isSmtpConfiguredMock,
}));

import { GET as routingGet, POST as routingPost } from "@/pages/api/user/email/routing";
import { GET as analyticsGet } from "@/pages/api/user/email/analytics";

function makeDb() {
  return {
    query: {
      notificationPreferences: {
        findMany: vi.fn(async () => ([
          { id: "pref-1", eventType: "ci_failed", emailEnabled: false },
          { id: "pref-2", eventType: "mention", emailEnabled: true },
        ])),
        findFirst: vi.fn(async () => ({ id: "pref-1", eventType: "ci_failed", emailEnabled: false })),
      },
      emailDigestSettings: {
        findFirst: vi.fn(async () => ({
          id: "digest-1",
          digestType: "daily",
          digestTime: "09:00",
          digestDay: 1,
          timezone: "UTC",
          lastSentAt: new Date("2026-02-18T09:00:00Z"),
        })),
      },
      notifications: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "n1" }, { id: "n2" }])
          .mockResolvedValueOnce([{ id: "n1" }, { id: "n2" }, { id: "n3" }]),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async () => undefined),
    })),
  };
}

async function json(response: Response): Promise<any> {
  return response.json();
}

describe("user email routing and analytics routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    isSmtpConfiguredMock.mockReturnValue(true);
  });

  it("returns routing matrix and updates route", async () => {
    const getResponse = await routingGet({ locals: { user: { id: "user-1" } } } as any);
    const getBody = await json(getResponse);

    expect(getResponse.status).toBe(200);
    expect(getBody?.data?.routing?.ci_failed).toBe(false);
    expect(getBody?.data?.routing?.mention).toBe(true);

    const postResponse = await routingPost({
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/user/email/routing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ routes: { ci_failed: true } }),
      }),
    } as any);

    const postBody = await json(postResponse);
    expect(postResponse.status).toBe(200);
    expect(postBody?.data?.updated).toBe(1);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("returns aggregated email analytics", async () => {
    const response = await analyticsGet({ locals: { user: { id: "user-1" } } } as any);
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body?.data?.smtpConfigured).toBe(true);
    expect(body?.data?.routing?.totalEvents).toBeGreaterThan(0);
    expect(body?.data?.volume?.unreadCount).toBe(2);
    expect(body?.data?.volume?.notificationsLast7Days).toBe(3);
    expect(typeof body?.data?.digest?.estimatedNextRunAt).toBe("string");
  });
});
