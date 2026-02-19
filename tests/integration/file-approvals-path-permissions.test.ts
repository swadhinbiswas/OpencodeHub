import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canAdminRepoMock,
  checkPathPermissionsMock,
  approveFileMock,
  getChangedFilesMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canAdminRepoMock: vi.fn(async () => false),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  approveFileMock: vi.fn(async () => ({ id: "fa-1", path: "src/app.ts" })),
  getChangedFilesMock: vi.fn(async () => ["src/app.ts", "src/secret.ts"]),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
    fileApprovals: { id: {}, pullRequestId: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
  canAdminRepo: canAdminRepoMock,
}));

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

vi.mock("@/lib/partial-file-approvals", () => ({
  approveFile: approveFileMock,
}));

vi.mock("@/lib/git-storage", () => ({
  resolveRepoPath: vi.fn(async () => "/tmp/repo"),
}));

vi.mock("@/lib/git", () => ({
  getRepoPath: vi.fn(() => "/tmp/repo"),
  getChangedFiles: getChangedFilesMock,
}));

import {
  GET as fileApprovalsGet,
  POST as fileApprovalsPost,
} from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/file-approvals";
import { DELETE as fileApprovalsDelete } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/file-approvals/[id]";

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
        findFirst: vi.fn(async () => ({ id: "pr-1", repositoryId: "repo-1", number: 42, state: "open" })),
      },
      fileApprovals: {
        findFirst: vi.fn(async () => ({ id: "fa-1", pullRequestId: "pr-1", approvedById: "user-1", path: "src/app.ts" })),
        findMany: vi.fn(async () => ([
          {
            id: "fa-1",
            pullRequestId: "pr-1",
            path: "src/app.ts",
            commitSha: "sha-1",
            approvedBy: { username: "alice" },
          },
          {
            id: "fa-2",
            pullRequestId: "pr-1",
            path: "src/secret.ts",
            commitSha: "sha-1",
            approvedBy: { username: "bob" },
          },
        ])),
      },
    },
    delete: vi.fn(() => ({
      where: vi.fn(async () => {}),
    })),
  };
}

describe("file approvals path permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    canAdminRepoMock.mockResolvedValue(false);
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
    getChangedFilesMock.mockResolvedValue(["src/app.ts", "src/secret.ts"]);
  });

  it("filters hidden files from GET results when read path scope denies access", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["src/secret.ts"],
      reason: "denied",
    });

    const response = await fileApprovalsGet({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1" } },
    } as any);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body?.data?.files).toHaveLength(1);
    expect(body?.data?.files?.[0]?.path).toBe("src/app.ts");
    expect(body?.data?.hiddenPaths).toBe(1);
    expect(checkPathPermissionsMock).toHaveBeenCalledWith("user-1", "repo-1", ["src/app.ts", "src/secret.ts"], "read");
  });

  it("blocks approving file when path permissions deny access", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["src/secret.ts"],
      reason: "denied",
    });

    const response = await fileApprovalsPost({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/file-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "src/secret.ts" }),
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(approveFileMock).not.toHaveBeenCalled();
  });

  it("approves file when path permissions allow access", async () => {
    const response = await fileApprovalsPost({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/file-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "src/app.ts" }),
      }),
    } as any);

    expect(response.status).toBe(200);
    expect(checkPathPermissionsMock).toHaveBeenCalledWith("user-1", "repo-1", ["src/app.ts"], "write");
    expect(approveFileMock).toHaveBeenCalled();
  });

  it("blocks delete when user lacks path permission for approval path", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["src/app.ts"],
      reason: "denied",
    });

    const response = await fileApprovalsDelete({
      params: { owner: "owner-1", repo: "demo", number: "42", id: "fa-1" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    expect(response.status).toBe(403);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});
