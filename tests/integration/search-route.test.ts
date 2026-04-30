/**
 * Integration tests for GET /api/search
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ─── hoisted mocks ─── */
const mocks = vi.hoisted(() => ({
  fakeSchema: {
    repositories: {
      name: "name",
      description: "description",
      starCount: "starCount",
    },
    users: { username: "username", displayName: "displayName" },
    issues: { title: "title", body: "body" },
    pullRequests: { title: "title", body: "body" },
    workflows: { name: "name" },
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
  like: vi.fn(),
  or: vi.fn((...args: any[]) => args),
  eq: vi.fn(),
  desc: vi.fn(),
}));

/* ─── helpers ─── */
function makeDb() {
  return {
    query: {
      repositories: {
        findMany: vi.fn().mockResolvedValue([
          {
            name: "my-project",
            description: "A project",
            owner: { username: "alice" },
            starCount: 10,
          },
        ]),
      },
      users: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ username: "alice", displayName: "Alice" }]),
      },
      issues: {
        findMany: vi.fn().mockResolvedValue([
          {
            title: "Bug fix",
            number: 1,
            repository: { name: "my-project", owner: { username: "alice" } },
          },
        ]),
      },
      pullRequests: {
        findMany: vi.fn().mockResolvedValue([
          {
            title: "Feature PR",
            number: 2,
            repository: { name: "my-project", owner: { username: "alice" } },
          },
        ]),
      },
      workflows: {
        findMany: vi.fn().mockResolvedValue([
          {
            name: "CI Build",
            repository: { name: "my-project", owner: { username: "alice" } },
          },
        ]),
      },
    },
  };
}

let mockDb: ReturnType<typeof makeDb>;
const readJson = (r: Response) => r.json();

function ctx(query: string) {
  return {
    request: new Request(
      `http://localhost/api/search?q=${encodeURIComponent(query)}`,
    ),
  } as any;
}

/* ─── import route ─── */
import { GET } from "@/pages/api/search";

/* ─── tests ─── */
describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns results for valid query", async () => {
    const res = await GET(ctx("project"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.results.length).toBeGreaterThan(0);
    expect(json.data.results.some((r: any) => r.type === "repository")).toBe(true);
    expect(json.data.results.some((r: any) => r.type === "user")).toBe(true);
    expect(json.data.results.some((r: any) => r.type === "issue")).toBe(true);
    expect(json.data.results.some((r: any) => r.type === "pr")).toBe(true);
    expect(json.data.results.some((r: any) => r.type === "workflow")).toBe(true);
  });

  it("returns empty results for short query", async () => {
    const res = await GET(ctx("a"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.results).toEqual([]);
  });

  it("returns empty results when no query", async () => {
    const res = await GET({
      request: new Request("http://localhost/api/search"),
    } as any);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.results).toEqual([]);
  });

  it("formats repository results correctly", async () => {
    mockDb.query.users.findMany.mockResolvedValue([]);
    mockDb.query.issues.findMany.mockResolvedValue([]);
    mockDb.query.pullRequests.findMany.mockResolvedValue([]);
    mockDb.query.workflows.findMany.mockResolvedValue([]);

    const res = await GET(ctx("project"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const repoResult = json.data.results.find((r: any) => r.type === "repository");
    expect(repoResult).toBeDefined();
    expect(repoResult.title).toBe("alice/my-project");
    expect(repoResult.url).toBe("/alice/my-project");
    expect(repoResult.icon).toBe("repo");
  });

  it("formats user results correctly", async () => {
    mockDb.query.repositories.findMany.mockResolvedValue([]);
    mockDb.query.issues.findMany.mockResolvedValue([]);
    mockDb.query.pullRequests.findMany.mockResolvedValue([]);
    mockDb.query.workflows.findMany.mockResolvedValue([]);

    const res = await GET(ctx("alice"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const userResult = json.data.results.find((r: any) => r.type === "user");
    expect(userResult).toBeDefined();
    expect(userResult.subtitle).toBe("@alice");
    expect(userResult.url).toBe("/alice");
  });

  it("handles empty DB results gracefully", async () => {
    mockDb.query.repositories.findMany.mockResolvedValue([]);
    mockDb.query.users.findMany.mockResolvedValue([]);
    mockDb.query.issues.findMany.mockResolvedValue([]);
    mockDb.query.pullRequests.findMany.mockResolvedValue([]);
    mockDb.query.workflows.findMany.mockResolvedValue([]);

    const res = await GET(ctx("nonexistent"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.results).toEqual([]);
  });
});
