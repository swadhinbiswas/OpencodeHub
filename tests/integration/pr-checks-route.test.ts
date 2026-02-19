import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  getCheckRunsMock,
  getCheckSummaryMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  getCheckRunsMock: vi.fn(async () => [
    { id: "check-1", name: "build", status: "completed", conclusion: "success" },
  ]),
  getCheckSummaryMock: vi.fn(async () => ({
    total: 1,
    passed: 1,
    failed: 0,
    pending: 0,
    neutral: 0,
    allPassing: true,
  })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
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

vi.mock("@/lib/pr-checks", () => ({
  getCheckRuns: getCheckRunsMock,
  getCheckSummary: getCheckSummaryMock,
}));

import { GET as getPrChecks } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/checks";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      pullRequests: {
        findFirst: vi.fn(async () => ({ id: "pr-1", number: 12, headSha: "abc123", mergeableState: "clean" })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("pull request checks route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await getPrChecks({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: {},
    } as any);

    expect(response.status).toBe(401);
  });

  it("returns checks and summary for authorized reader", async () => {
    const response = await getPrChecks({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.summary?.allPassing).toBe(true);
    expect(body?.data?.checks).toHaveLength(1);
    expect(getCheckRunsMock).toHaveBeenCalledWith("pr-1");
    expect(getCheckSummaryMock).toHaveBeenCalledWith("pr-1");
  });
});
