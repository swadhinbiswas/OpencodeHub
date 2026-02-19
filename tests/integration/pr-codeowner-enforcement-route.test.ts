import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  compareBranchesMock,
  resolveRepoPathMock,
  checkCodeOwnerApprovalsMock,
  getCodeOwnersSummaryMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  compareBranchesMock: vi.fn(async () => ({
    diffs: [{ file: "src/app.ts", additions: 1, deletions: 0 }],
  })),
  resolveRepoPathMock: vi.fn(async () => "/tmp/repos/demo.git"),
  checkCodeOwnerApprovalsMock: vi.fn(async () => ({
    canMerge: false,
    missingApprovals: [
      {
        path: "src/app.ts",
        requiredOwners: ["@team-core"],
        approvedBy: ["alice"],
      },
    ],
  })),
  getCodeOwnersSummaryMock: vi.fn(async () => [
    { path: "src/app.ts", owners: ["@team-core"] },
  ]),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
    reviewRequirements: { repositoryId: {}, requireCodeOwner: {} },
    branchProtection: { repositoryId: {}, active: {}, pattern: {}, requireCodeOwnerReviews: {}, id: {} },
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

vi.mock("@/lib/git", () => ({
  compareBranches: compareBranchesMock,
}));

vi.mock("@/lib/git-storage", () => ({
  resolveRepoPath: resolveRepoPathMock,
}));

vi.mock("@/lib/codeowners-enforcement", () => ({
  checkCodeOwnerApprovals: checkCodeOwnerApprovalsMock,
  getCodeOwnersSummary: getCodeOwnersSummaryMock,
}));

import { GET as codeOwnerEnforcementGet } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/codeowner-enforcement";

function makeDb({
  requireCodeOwner = true,
  branchRule = null as any,
} = {}) {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({
          id: "repo-1",
          ownerId: "owner-1",
          name: "demo",
          diskPath: "repos/owner-1/demo.git",
        })),
      },
      pullRequests: {
        findFirst: vi.fn(async () => ({
          id: "pr-1",
          repositoryId: "repo-1",
          number: 12,
          baseBranch: "main",
          headBranch: "feature",
        })),
      },
      reviewRequirements: {
        findFirst: vi.fn(async () => ({
          requireCodeOwner,
        })),
      },
      branchProtection: {
        findMany: vi.fn(async () => (branchRule ? [branchRule] : [])),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("pull request codeowner enforcement route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns blocker details when codeowner approval is enforced and missing", async () => {
    const response = await codeOwnerEnforcementGet({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.enforced).toBe(true);
    expect(body?.data?.ready).toBe(false);
    expect(body?.data?.blockers?.length).toBe(1);
    expect(body?.data?.files?.[0]?.approved).toBe(false);
    expect(checkCodeOwnerApprovalsMock).toHaveBeenCalledWith("repo-1", "pr-1", ["src/app.ts"]);
  });

  it("returns non-enforced status when no policy requires codeowner reviews", async () => {
    mockDb = makeDb({
      requireCodeOwner: false,
      branchRule: {
        id: "rule-1",
        pattern: "main",
        requireCodeOwnerReviews: false,
      },
    });

    const response = await codeOwnerEnforcementGet({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.enforced).toBe(false);
    expect(checkCodeOwnerApprovalsMock).not.toHaveBeenCalled();
    expect(getCodeOwnersSummaryMock).not.toHaveBeenCalled();
  });
});
