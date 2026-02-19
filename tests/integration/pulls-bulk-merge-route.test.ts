import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canWriteRepoMock,
  compareBranchesMock,
  resolveRepoPathMock,
  checkPathPermissionsMock,
  bulkMergePRsMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canWriteRepoMock: vi.fn(async () => true),
  compareBranchesMock: vi.fn(async () => ({
    diffs: [{ file: "src/app.ts", additions: 1, deletions: 0 }],
  })),
  resolveRepoPathMock: vi.fn(async () => "/tmp/repos/demo.git"),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  bulkMergePRsMock: vi.fn(async () => ({
    success: true,
    merged: [{ prId: "pr-1", prNumber: 1 }],
    failed: [],
    skipped: [],
  })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, id: {} },
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
}));

vi.mock("@/lib/git-storage", () => ({
  resolveRepoPath: resolveRepoPathMock,
}));

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

vi.mock("@/lib/bulk-merge", () => ({
  bulkMergePRs: bulkMergePRsMock,
}));

import { POST as bulkMergePost } from "@/pages/api/repos/[owner]/[repo]/pulls/bulk-merge";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo", diskPath: "repos/owner-1/demo.git" })),
      },
      pullRequests: {
        findMany: vi.fn(async () => [
          { id: "pr-1", number: 1, baseBranch: "main", headBranch: "feature-1" },
          { id: "pr-2", number: 2, baseBranch: "main", headBranch: "feature-2" },
        ]),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("bulk merge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    canWriteRepoMock.mockResolvedValue(true);
    compareBranchesMock.mockResolvedValue({
      diffs: [{ file: "src/app.ts", additions: 1, deletions: 0 }],
    });
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
    bulkMergePRsMock.mockResolvedValue({
      success: true,
      merged: [{ prId: "pr-1", prNumber: 1 }],
      failed: [],
      skipped: [],
    });
  });

  it("returns forbidden for users without write access", async () => {
    canWriteRepoMock.mockResolvedValue(false);

    const response = await bulkMergePost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/bulk-merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prIds: ["pr-1"] }),
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(bulkMergePRsMock).not.toHaveBeenCalled();
  });

  it("rejects PR ids not in repository", async () => {
    mockDb.query.pullRequests.findMany.mockResolvedValueOnce([{ id: "pr-1" }]);

    const response = await bulkMergePost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/bulk-merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prIds: ["pr-1", "pr-x"] }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body?.error?.message).toMatch(/do not belong/i);
    expect(bulkMergePRsMock).not.toHaveBeenCalled();
  });

  it("calls bulk merge with validated ids and options", async () => {
    const response = await bulkMergePost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/bulk-merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prIds: ["pr-1", "pr-1", "pr-2"], mergeMethod: "squash" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.success).toBe(true);
    expect(bulkMergePRsMock).toHaveBeenCalledWith(["pr-1", "pr-2"], "user-1", {
      mergeMethod: "squash",
    });
    expect(checkPathPermissionsMock).toHaveBeenCalled();
  });

  it("blocks bulk merge when path permissions deny one PR", async () => {
    compareBranchesMock
      .mockResolvedValueOnce({
        diffs: [{ file: "src/app.ts", additions: 1, deletions: 0 }],
      })
      .mockResolvedValueOnce({
        diffs: [{ file: "secure/secret.ts", additions: 2, deletions: 1 }],
      });
    checkPathPermissionsMock
      .mockResolvedValueOnce({ allowed: true, deniedPaths: [] })
      .mockResolvedValueOnce({
        allowed: false,
        deniedPaths: ["secure/secret.ts"],
        reason: "Insufficient permissions for paths: secure/secret.ts",
      });

    const response = await bulkMergePost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/bulk-merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prIds: ["pr-1", "pr-2"] }),
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(bulkMergePRsMock).not.toHaveBeenCalled();
  });
});
