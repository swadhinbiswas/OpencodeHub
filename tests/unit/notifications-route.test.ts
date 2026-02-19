import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserFromRequestMock } = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(),
}));

let mockDb: any;

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: getUserFromRequestMock,
}));

vi.mock("@/db", async () => {
  const actual = await vi.importActual<typeof import("@/db")>("@/db");
  return {
    ...actual,
    getDatabase: () => mockDb,
  };
});

import { GET as listNotificationsGet } from "@/pages/api/notifications/index";

describe("notifications list route", () => {
  beforeEach(() => {
    getUserFromRequestMock.mockReset();
    mockDb = {
      query: {
        notifications: {
          findMany: vi.fn(),
        },
      },
    };
  });

  it("returns unauthorized when no auth token is present", async () => {
    getUserFromRequestMock.mockResolvedValue(null);

    const response = await listNotificationsGet({
      request: new Request("http://localhost/api/notifications"),
      url: new URL("http://localhost/api/notifications"),
    } as any);

    expect(response.status).toBe(401);
  });

  it("supports filter=blocking and returns unread count", async () => {
    getUserFromRequestMock.mockResolvedValue({ userId: "user-1" });
    mockDb.query.notifications.findMany
      .mockResolvedValueOnce([{ id: "notif-1", type: "ci_failed" }])
      .mockResolvedValueOnce([{ id: "notif-2" }, { id: "notif-3" }]);

    const response = await listNotificationsGet({
      request: new Request("http://localhost/api/notifications?filter=blocking"),
      url: new URL("http://localhost/api/notifications?filter=blocking"),
    } as any);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.data?.notifications).toHaveLength(1);
    expect(body?.data?.unreadCount).toBe(2);
    expect(mockDb.query.notifications.findMany).toHaveBeenCalledTimes(2);
  });
});
