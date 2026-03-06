/**
 * Integration tests for GET /api/admin/stats
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ─── hoisted mocks ─── */
const mocks = vi.hoisted(() => ({
  selectMock: vi.fn(),
  fakeSchema: {
    repositories: { languages: "languages" },
    users: {},
    pullRequests: { state: "state" },
    commits: { stats: "stats", authorDate: "authorDate" },
    issues: { state: "state" },
    activities: { userId: "userId", createdAt: "createdAt" },
    releases: {},
  },
}));

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: mocks.fakeSchema,
}));

vi.mock("@/lib/errors", () => ({
  withErrorHandler: (fn: any) => fn,
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(() => "count_expr"),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
}));

/* ─── helpers ─── */
function makeDb() {
  const chainable = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ count: 5 }]),
  };
  return {
    select: vi.fn().mockReturnValue(chainable),
    selectDistinct: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ userId: "usr_1" }]),
      }),
    }),
    query: {
      users: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { username: "alice", createdAt: new Date(), avatarUrl: null },
          ]),
      },
      activities: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "act_1",
            type: "PUSH",
            action: "pushed",
            targetType: "branch",
            createdAt: new Date(),
            user: { username: "alice" },
            repository: { name: "my-repo" },
          },
        ]),
      },
    },
  };
}

let mockDb: ReturnType<typeof makeDb>;
const readJson = (r: Response) => r.json();

function ctx(isAdmin: boolean) {
  return {
    locals: {
      user: isAdmin
        ? { id: "usr_1", username: "admin", isAdmin: true }
        : { id: "usr_2", username: "user", isAdmin: false },
    },
  } as any;
}

/* ─── import route ─── */
import { GET } from "@/pages/api/admin/stats";

/* ─── tests ─── */
describe("GET /api/admin/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns 200 with stats for admin user", async () => {
    const res = await GET(ctx(true));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.totalRepos).toBeDefined();
    expect(json.totalUsers).toBeDefined();
    expect(json.systemStatus).toBeDefined();
    expect(json.systemStatus.cpuLoad).toBeGreaterThanOrEqual(0);
    expect(json.systemStatus.memoryUsage).toBeGreaterThanOrEqual(0);
  });

  it("returns 403 for non-admin user", async () => {
    const res = await GET(ctx(false));
    expect(res.status).toBe(403);
  });

  it("returns 403 when no user", async () => {
    const res = await GET({ locals: {} } as any);
    expect(res.status).toBe(403);
  });

  it("returns quickStats", async () => {
    const res = await GET(ctx(true));
    const json = await readJson(res);
    expect(json.quickStats).toBeDefined();
    expect(typeof json.quickStats.commitsToday).toBe("number");
    expect(typeof json.quickStats.activeUsers).toBe("number");
  });

  it("returns languages stats", async () => {
    const res = await GET(ctx(true));
    const json = await readJson(res);
    expect(json.languages).toBeDefined();
    expect(Array.isArray(json.languages)).toBe(true);
  });

  it("returns recentActivity", async () => {
    const res = await GET(ctx(true));
    const json = await readJson(res);
    expect(json.recentActivity).toBeDefined();
    expect(Array.isArray(json.recentActivity)).toBe(true);
  });
});
