import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canWriteRepoMock,
  compareBranchesMock,
  mergeBranchMock,
  resolveRepoPathMock,
  checkPathPermissionsMock,
  evaluateGatesMock,
  closeLinkedIssuesOnMergeMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canWriteRepoMock: vi.fn(async () => true),
  compareBranchesMock: vi.fn(async () => ({
    diffs: [{ file: "src/app.ts", additions: 1, deletions: 0 }],
  })),
  mergeBranchMock: vi.fn(async () => ({ success: true, message: "ok" })),
  resolveRepoPathMock: vi.fn(async () => "/tmp/repos/demo.git"),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  evaluateGatesMock: vi.fn(async () => ({
    canMerge: true,
    results: [],
  })),
  closeLinkedIssuesOnMergeMock: vi.fn(async () => undefined),
  fakeSchema: {
    users: { username: {}, id: {} },
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
  canWriteRepo: canWriteRepoMock,
}));

vi.mock("@/lib/git", () => ({
  compareBranches: compareBranchesMock,
  mergeBranch: mergeBranchMock,
}));

vi.mock("@/lib/git-storage", () => ({
  resolveRepoPath: resolveRepoPathMock,
}));

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

vi.mock("@/lib/ci-gates", () => ({
  evaluateGates: evaluateGatesMock,
}));

vi.mock("@/lib/pr-issue-linking", () => ({
  closeLinkedIssuesOnMerge: closeLinkedIssuesOnMergeMock,
}));

import { POST as mergePost } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/merge";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1", username: "owner-1", email: null })),
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
          title: "Update app",
          state: "open",
          baseBranch: "main",
          headBranch: "feature",
          authorId: "user-1",
        })),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
  };
}

describe("pull request merge route path permissions", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canWriteRepoMock.mockResolvedValue(true);
    compareBranchesMock.mockResolvedValue({
      diffs: [{ file: "src/app.ts", additions: 1, deletions: 0 }],
    });
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
    evaluateGatesMock.mockResolvedValue({ canMerge: true, results: [] });
    mergeBranchMock.mockResolvedValue({ success: true, message: "ok" });
  });

  it("blocks merge when changed files violate path permissions", async () => {
    compareBranchesMock.mockResolvedValue({
      diffs: [{ file: "secure/secret.ts", additions: 2, deletions: 1 }],
    });
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/secret.ts"],
      reason: "Insufficient permissions for paths: secure/secret.ts",
    });

    const response = await mergePost({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false, username: "user-1" } },
    } as any);

    expect(response.status).toBe(403);
    expect(evaluateGatesMock).not.toHaveBeenCalled();
    expect(mergeBranchMock).not.toHaveBeenCalled();
  });

  it("merges when path permissions pass", async () => {
    const response = await mergePost({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false, username: "user-1" } },
    } as any);

    expect(response.status).toBe(200);
    expect(checkPathPermissionsMock).toHaveBeenCalledWith("user-1", "repo-1", ["src/app.ts"], "write");
    expect(evaluateGatesMock).toHaveBeenCalledWith("pr-1");
    expect(mergeBranchMock).toHaveBeenCalled();
  });
});
