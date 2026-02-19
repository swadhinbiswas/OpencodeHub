import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canWriteRepoMock,
  checkPathPermissionsMock,
  getRewriteOperationFilesMock,
  rewriteBranchHistoryMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canWriteRepoMock: vi.fn(async () => true),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  getRewriteOperationFilesMock: vi.fn(async () => ["src/app.ts"]),
  rewriteBranchHistoryMock: vi.fn(async () => undefined),
  fakeSchema: {
    repositories: { name: {}, ownerId: {}, id: {} },
    users: { username: {} },
    pullRequests: { repositoryId: {}, number: {} },
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

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

vi.mock("@/lib/git-rewrite", () => ({
  getRewriteOperationFiles: getRewriteOperationFilesMock,
  rewriteBranchHistory: rewriteBranchHistoryMock,
}));

import { POST as rewritePost } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/rewrite";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({
          id: "repo-1",
          name: "demo",
          ownerId: "owner-1",
          owner: { username: "owner-1" },
        })),
      },
      pullRequests: {
        findFirst: vi.fn(async () => ({
          id: "pr-1",
          number: 42,
          repositoryId: "repo-1",
          baseBranch: "main",
          headBranch: "feature",
        })),
      },
    },
  };
}

describe("pull rewrite path permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    canWriteRepoMock.mockResolvedValue(true);
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
    getRewriteOperationFilesMock.mockResolvedValue(["src/app.ts"]);
  });

  it("blocks rewrite when touched paths are denied", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["src/secret.ts"],
      reason: "Insufficient permissions for paths: src/secret.ts",
    });

    const response = await rewritePost({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operations: [{ type: "pick", hash: "abc123" }],
        }),
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(rewriteBranchHistoryMock).not.toHaveBeenCalled();
  });

  it("executes rewrite when touched paths are allowed", async () => {
    const response = await rewritePost({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operations: [{ type: "pick", hash: "abc123" }],
        }),
      }),
    } as any);

    expect(response.status).toBe(200);
    expect(getRewriteOperationFilesMock).toHaveBeenCalled();
    expect(checkPathPermissionsMock).toHaveBeenCalledWith("user-1", "repo-1", ["src/app.ts"], "write");
    expect(rewriteBranchHistoryMock).toHaveBeenCalled();
  });
});
