import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  getRepoStatsMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  getRepoStatsMock: vi.fn(async () => [
    { date: "2026-02-10", cycleTime: 3, mergeCount: 2, reviewTime: 1.5 },
    { date: "2026-02-11", cycleTime: 5, mergeCount: 1, reviewTime: 2.5 },
  ]),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
}));

vi.mock("@/lib/analytics", () => ({
  getRepoStats: getRepoStatsMock,
}));

import { GET as getMergeFrequency } from "@/pages/api/repos/[owner]/[repo]/analytics/merge-frequency";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("merge frequency analytics route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    getRepoStatsMock.mockResolvedValue([
      { date: "2026-02-10", cycleTime: 3, mergeCount: 2, reviewTime: 1.5 },
      { date: "2026-02-11", cycleTime: 5, mergeCount: 1, reviewTime: 2.5 },
    ]);
  });

  it("returns daily points by default", async () => {
    const response = await getMergeFrequency({
      params: { owner: "owner-1", repo: "demo" },
      url: new URL("http://localhost/api/repos/owner-1/demo/analytics/merge-frequency"),
      locals: { user: { id: "user-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.bucket).toBe("day");
    expect(body?.data?.points).toHaveLength(2);
    expect(getRepoStatsMock).toHaveBeenCalledWith("repo-1", 30);
  });

  it("aggregates weekly points when bucket=week", async () => {
    const response = await getMergeFrequency({
      params: { owner: "owner-1", repo: "demo" },
      url: new URL("http://localhost/api/repos/owner-1/demo/analytics/merge-frequency?days=60&bucket=week"),
      locals: { user: { id: "user-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.bucket).toBe("week");
    expect(body?.data?.points?.length).toBeGreaterThan(0);
    expect(body?.data?.points?.[0]?.mergeCount).toBe(3);
    expect(getRepoStatsMock).toHaveBeenCalledWith("repo-1", 60);
  });
});
