import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canMergeStackMock,
  getStackApprovalStatusMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canMergeStackMock: vi.fn(async () => ({ canMerge: true, blockers: [] })),
  getStackApprovalStatusMock: vi.fn(async () => ({ stackId: "stack-1", allApproved: true, prs: [] })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    prStacks: { id: {}, repositoryId: {} },
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

vi.mock("@/lib/stack-approvals", () => ({
  canMergeStack: canMergeStackMock,
  getStackApprovalStatus: getStackApprovalStatusMock,
}));

import { GET as getMergeReadiness } from "@/pages/api/repos/[owner]/[repo]/stacks/[stackId]/merge-readiness";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      prStacks: {
        findFirst: vi.fn(async () => ({ id: "stack-1", repositoryId: "repo-1" })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("stack merge readiness route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    canMergeStackMock.mockResolvedValue({ canMerge: true, blockers: [] });
    getStackApprovalStatusMock.mockResolvedValue({ stackId: "stack-1", allApproved: true, prs: [] });
  });

  it("returns readiness and blockers for authorized requests", async () => {
    canMergeStackMock.mockResolvedValueOnce({
      canMerge: false,
      blockers: ["PR #12: Needs 1 more approval(s)"],
    });

    const response = await getMergeReadiness({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "user-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.canMerge).toBe(false);
    expect(body?.data?.blockers).toEqual(["PR #12: Needs 1 more approval(s)"]);
  });
});

