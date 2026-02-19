import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  getDeveloperWorkloadsMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  getDeveloperWorkloadsMock: vi.fn(async () => ([
    {
      userId: "u1",
      userName: "Dev 1",
      openPRs: 3,
      pendingReviews: 2,
      assignedIssues: 1,
      recentCommits: 0,
      avgReviewTime: 0,
      workloadScore: 85,
      trend: "increasing",
    },
    {
      userId: "u2",
      userName: "Dev 2",
      openPRs: 0,
      pendingReviews: 0,
      assignedIssues: 1,
      recentCommits: 0,
      avgReviewTime: 0,
      workloadScore: 15,
      trend: "decreasing",
    },
  ])),
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

vi.mock("@/lib/analytics-advanced", () => ({
  getDeveloperWorkloads: getDeveloperWorkloadsMock,
}));

import { GET as getWorkload } from "@/pages/api/repos/[owner]/[repo]/analytics/workload";

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

describe("analytics workload route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
  });

  it("returns repository workload summary", async () => {
    const response = await getWorkload({
      params: { owner: "owner-1", repo: "demo" },
      url: new URL("http://localhost/api/repos/owner-1/demo/analytics/workload?days=14"),
      locals: { user: { id: "user-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.summary?.overloadedCount).toBe(1);
    expect(body?.data?.summary?.underutilizedCount).toBe(1);
    expect(getDeveloperWorkloadsMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      days: 14,
    });
  });

  it("applies contributor limit", async () => {
    const response = await getWorkload({
      params: { owner: "owner-1", repo: "demo" },
      url: new URL("http://localhost/api/repos/owner-1/demo/analytics/workload?limit=1"),
      locals: { user: { id: "user-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.contributors).toHaveLength(1);
  });
});
