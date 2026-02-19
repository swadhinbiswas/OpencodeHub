import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  evaluateGatesMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  evaluateGatesMock: vi.fn(async () => ({
    canMerge: false,
    results: [
      { passed: false, gateName: "Review", message: "At least one approval required" },
      { passed: true, gateName: "Merge Conflicts", message: "No conflicts" },
    ],
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

vi.mock("@/lib/ci-gates", () => ({
  evaluateGates: evaluateGatesMock,
}));

import { GET as mergeReadinessGet } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/merge-readiness";

function makeDb(prState: "open" | "closed" = "open") {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      pullRequests: {
        findFirst: vi.fn(async () => ({
          id: "pr-1",
          number: 12,
          state: prState,
          isDraft: false,
          mergeable: true,
          mergeableState: "clean",
        })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("pull request merge-readiness route", () => {
  beforeEach(() => {
    mockDb = makeDb("open");
    canReadRepoMock.mockResolvedValue(true);
    evaluateGatesMock.mockResolvedValue({
      canMerge: false,
      results: [
        { passed: false, gateName: "Review", message: "At least one approval required" },
        { passed: true, gateName: "Merge Conflicts", message: "No conflicts" },
      ],
    });
  });

  it("returns gate blockers for open PRs", async () => {
    const response = await mergeReadinessGet({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.canMerge).toBe(false);
    expect(body?.data?.blockers).toContain("At least one approval required");
    expect(body?.data?.policyReport?.failedGates).toBe(1);
    expect(body?.data?.policyReport?.failedByType?.review).toBe(1);
    expect(body?.data?.policyReport?.recommendations).toContain(
      "Request required approvals and resolve review feedback."
    );
    expect(evaluateGatesMock).toHaveBeenCalledWith("pr-1");
  });

  it("returns closed-state blocker without evaluating gates", async () => {
    mockDb = makeDb("closed");

    const response = await mergeReadinessGet({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.canMerge).toBe(false);
    expect(body?.data?.blockers).toEqual(["Pull request is not open"]);
    expect(body?.data?.policyReport?.failedGates).toBe(0);
    expect(body?.data?.policyReport?.recommendations).toContain(
      "Re-open the pull request before attempting to merge."
    );
  });
});
