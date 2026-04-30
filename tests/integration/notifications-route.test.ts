/**
 * Integration tests for GET /api/notifications
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ─── hoisted mocks ─── */
const mocks = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn().mockResolvedValue({
    userId: "usr_1",
    username: "alice",
  }),
  scoreNotificationPriorityMock: vi.fn().mockReturnValue({
    score: 5,
    priority: "medium",
    isBlocking: false,
  }),
  getRoutingDecisionMock: vi.fn().mockReturnValue({
    channels: ["in_app"],
    primaryChannel: "in_app",
  }),
  channelEnabledMock: vi.fn().mockReturnValue(true),
  computePersonalizationBoostMock: vi.fn().mockReturnValue(0),
  fakeSchema: {
    notifications: "notifications",
    notificationPreferences: {
      userId: "userId",
      repositoryId: "repositoryId",
    },
  },
}));

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: mocks.fakeSchema,
}));

vi.mock("@/db/schema", () => ({
  notifications: "notifications",
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: mocks.getUserFromRequestMock,
}));

vi.mock("@/lib/notification-priority", () => ({
  scoreNotificationPriority: mocks.scoreNotificationPriorityMock,
}));

vi.mock("@/lib/notification-routing", () => ({
  getRoutingDecision: mocks.getRoutingDecisionMock,
  channelEnabled: mocks.channelEnabledMock,
  computePersonalizationBoost: mocks.computePersonalizationBoostMock,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn((...args: any[]) => args),
  or: vi.fn((...args: any[]) => args),
  isNull: vi.fn(),
}));

/* ─── helpers ─── */
const fakeNotification = {
  id: "notif_1",
  userId: "usr_1",
  type: "comment",
  reason: "mention",
  isRead: false,
  isArchived: false,
  createdAt: new Date().toISOString(),
  actor: { id: "usr_2", username: "bob", displayName: "Bob", avatarUrl: null },
  repository: { id: "repo_1", name: "my-repo", slug: "my-repo" },
};

function makeDb() {
  return {
    query: {
      notifications: {
        findMany: vi.fn().mockResolvedValue([fakeNotification]),
      },
      notificationPreferences: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };
}

let mockDb: ReturnType<typeof makeDb>;
const readJson = (r: Response) => r.json();

function ctx(params = "") {
  const reqUrl = `http://localhost/api/notifications${params}`;
  return {
    request: new Request(reqUrl),
    url: new URL(reqUrl),
  } as any;
}

/* ─── import route ─── */
import { GET } from "@/pages/api/notifications/index";

/* ─── tests ─── */
describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    mocks.getUserFromRequestMock.mockResolvedValue({
      userId: "usr_1",
      username: "alice",
    });
  });

  it("returns 200 with notifications for authenticated user", async () => {
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.notifications).toBeDefined();
    expect(json.data.notifications.length).toBe(1);
    expect(json.data.unreadCount).toBeDefined();
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await GET(ctx());
    expect(res.status).toBe(401);
  });

  it("enriches notifications with priority", async () => {
    const res = await GET(ctx());
    const json = await readJson(res);
    expect(json.data.notifications[0].priority).toBe("medium");
    expect(json.data.notifications[0].priorityScore).toBeGreaterThanOrEqual(0);
  });

  it("enriches with routing info", async () => {
    const res = await GET(ctx());
    const json = await readJson(res);
    expect(json.data.notifications[0].routeChannels).toEqual(["in_app"]);
    expect(json.data.notifications[0].primaryRouteChannel).toBe("in_app");
  });

  it("filters by channel when param provided", async () => {
    mocks.channelEnabledMock.mockReturnValue(false);
    const res = await GET(ctx("?channel=email"));
    const json = await readJson(res);
    expect(json.data.notifications.length).toBe(0);
  });

  it("supports prioritize param", async () => {
    // add two notifs with different scores
    const high = { ...fakeNotification, id: "notif_h" };
    const low = { ...fakeNotification, id: "notif_l" };
    mockDb.query.notifications.findMany
      .mockResolvedValueOnce([low, high])
      .mockResolvedValueOnce([low, high]) // history
      .mockResolvedValueOnce([low, high]); // unread count

    mocks.scoreNotificationPriorityMock
      .mockReturnValueOnce({ score: 1, priority: "low", isBlocking: false })
      .mockReturnValueOnce({ score: 10, priority: "high", isBlocking: true });

    const res = await GET(ctx("?prioritize=true"));
    expect(res.status).toBe(200);
  });

  it("returns routing metadata", async () => {
    const res = await GET(ctx("?personalize=true"));
    const json = await readJson(res);
    expect(json.data.routing.personalized).toBe(true);
    expect(json.data.routing.channelFilter).toBeNull();
  });

  it("handles empty notifications", async () => {
    mockDb.query.notifications.findMany.mockResolvedValue([]);
    const res = await GET(ctx());
    const json = await readJson(res);
    expect(json.data.notifications).toEqual([]);
    expect(json.data.unreadCount).toBe(0);
  });
});
