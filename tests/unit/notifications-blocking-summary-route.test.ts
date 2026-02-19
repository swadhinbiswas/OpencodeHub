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

import { GET as blockingSummaryGet } from "@/pages/api/notifications/blocking/summary";

describe("notifications blocking summary route", () => {
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

  it("returns unauthorized when not authenticated", async () => {
    getUserFromRequestMock.mockResolvedValue(null);

    const response = await blockingSummaryGet({
      request: new Request("http://localhost/api/notifications/blocking/summary"),
    } as any);

    expect(response.status).toBe(401);
  });

  it("returns blocking summary aggregates", async () => {
    getUserFromRequestMock.mockResolvedValue({ userId: "user-1" });
    mockDb.query.notifications.findMany.mockResolvedValue([
      {
        id: "n1",
        type: "security_alert",
        reason: "security_alert",
        isRead: false,
        isArchived: false,
        createdAt: new Date("2026-02-19T00:00:00Z"),
      },
      {
        id: "n2",
        type: "ci_failed",
        reason: "ci_failed",
        isRead: true,
        isArchived: false,
        createdAt: new Date("2026-02-18T00:00:00Z"),
      },
    ]);

    const response = await blockingSummaryGet({
      request: new Request("http://localhost/api/notifications/blocking/summary"),
    } as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body?.data?.totalBlocking).toBe(2);
    expect(body?.data?.unreadBlockingCount).toBe(1);
    expect(body?.data?.countsByType?.security_alert).toBe(1);
    expect(body?.data?.topPriority).toBe("critical");
    expect(body?.data?.items).toHaveLength(2);
  });
});
