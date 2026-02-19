import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canWriteRepoMock,
  compareBranchesMock,
  resolveRepoPathMock,
  checkPathPermissionsMock,
  getAutoMergeStatusMock,
  enableAutoMergeMock,
  disableAutoMergeMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  compareBranchesMock: vi.fn(async () => ({
    diffs: [{ file: "src/app.ts", additions: 1, deletions: 0 }],
  })),
  resolveRepoPathMock: vi.fn(async () => "/tmp/repos/demo.git"),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  getAutoMergeStatusMock: vi.fn(async () => ({
    enabled: true,
    eligibleToMerge: false,
    blockers: ["1 pending check(s)"],
  })),
  enableAutoMergeMock: vi.fn(async () => ({ success: true })),
  disableAutoMergeMock: vi.fn(async () => true),
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

vi.mock("@/lib/auto-merge", () => ({
  getAutoMergeStatus: getAutoMergeStatusMock,
  enableAutoMerge: enableAutoMergeMock,
  disableAutoMerge: disableAutoMergeMock,
}));

import {
  GET as getAutoMergeGet,
  POST as autoMergePost,
  DELETE as autoMergeDelete,
} from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/auto-merge";

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
        findFirst: vi.fn(async () => ({
          id: "pr-1",
          repositoryId: "repo-1",
          number: 12,
          baseBranch: "main",
          headBranch: "feature",
        })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("pull request auto-merge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    canWriteRepoMock.mockResolvedValue(true);
    getAutoMergeStatusMock.mockResolvedValue({
      enabled: true,
      eligibleToMerge: false,
      blockers: ["1 pending check(s)"],
    });
    compareBranchesMock.mockResolvedValue({
      diffs: [{ file: "src/app.ts", additions: 1, deletions: 0 }],
    });
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
    enableAutoMergeMock.mockResolvedValue({ success: true });
    disableAutoMergeMock.mockResolvedValue(true);
  });

  it("returns status for authorized readers", async () => {
    const response = await getAutoMergeGet({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.enabled).toBe(true);
    expect(getAutoMergeStatusMock).toHaveBeenCalledWith("pr-1");
  });

  it("enables auto-merge for writers", async () => {
    const response = await autoMergePost({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/12/auto-merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mergeMethod: "squash" }),
      }),
    } as any);

    expect(response.status).toBe(200);
    expect(enableAutoMergeMock).toHaveBeenCalledWith("pr-1", "user-1", {
      mergeMethod: "squash",
    });
    expect(checkPathPermissionsMock).toHaveBeenCalledWith("user-1", "repo-1", ["src/app.ts"], "write");
  });

  it("disables auto-merge for writers", async () => {
    const response = await autoMergeDelete({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    expect(response.status).toBe(200);
    expect(disableAutoMergeMock).toHaveBeenCalledWith("pr-1");
  });

  it("blocks enabling auto-merge when path permissions deny changed files", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/secret.ts"],
      reason: "Insufficient permissions for paths: secure/secret.ts",
    });
    compareBranchesMock.mockResolvedValue({
      diffs: [{ file: "secure/secret.ts", additions: 1, deletions: 0 }],
    });

    const response = await autoMergePost({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/12/auto-merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mergeMethod: "squash" }),
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(enableAutoMergeMock).not.toHaveBeenCalled();
  });
});
