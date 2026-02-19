import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserFromRequestMock, checkPathPermissionsMock, canReadRepoMock, canWriteRepoMock, fakeSchema } = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(async () => ({ userId: "user-1", isAdmin: false })),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  fakeSchema: {
    users: { username: {}, id: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { number: {}, repositoryId: {} },
    pullRequestComments: { id: {}, pullRequestId: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: getUserFromRequestMock,
}));

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
  canWriteRepo: canWriteRepoMock,
}));

import { POST as createCommentPost } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/comments";
import { PATCH as updateCommentPatch } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/comments";
import { DELETE as deleteCommentDelete } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/comments";

function makeDb() {
  const pr = {
    id: "pr-1",
    repositoryId: "repo-1",
    repository: { id: "repo-1", ownerId: "owner-1" },
  };
  const commentForMutation = {
    id: "comment-1",
    authorId: "user-1",
    path: "secure/config.yml",
    pullRequest: {
      repositoryId: "repo-1",
      repository: { ownerId: "owner-1" },
    },
  };
  const insertCalls: unknown[] = [];
  const updateCalls: unknown[] = [];
  const deleteCalls: unknown[] = [];

  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      pullRequests: {
        findFirst: vi.fn(async () => pr),
      },
      pullRequestComments: {
        findFirst: vi.fn(async (_args?: any) => {
          if (_args?.with?.pullRequest) return commentForMutation;
          return { id: "comment-1", author: { username: "user-1" } };
        }),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(async (value: unknown) => {
        insertCalls.push(value);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((value: unknown) => ({
        where: vi.fn(async () => {
          updateCalls.push(value);
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async (value: unknown) => {
        deleteCalls.push(value);
      }),
    })),
    __state: { insertCalls },
    __mutationState: { updateCalls, deleteCalls },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("PR comments path permissions", () => {
  beforeEach(() => {
    mockDb = makeDb();
    getUserFromRequestMock.mockResolvedValue({ userId: "user-1", isAdmin: false });
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
    canReadRepoMock.mockResolvedValue(true);
    canWriteRepoMock.mockResolvedValue(true);
  });

  it("blocks inline comment creation when path write permission is denied", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/config.yml"],
      reason: "Insufficient permissions for paths: secure/config.yml",
    });

    const response = await createCommentPost({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "blocked", path: "secure/config.yml", line: 1 }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
    expect(mockDb.__state.insertCalls).toHaveLength(0);
  });

  it("blocks comment creation when repository write permission is denied", async () => {
    canWriteRepoMock.mockResolvedValue(false);

    const response = await createCommentPost({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "blocked", path: "src/app.ts", line: 1 }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
    expect(mockDb.__state.insertCalls).toHaveLength(0);
  });

  it("allows comment creation when path permission check passes", async () => {
    const response = await createCommentPost({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "allowed", path: "src/app.ts", line: 3 }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.success).toBe(true);
    expect(checkPathPermissionsMock).toHaveBeenCalledWith("user-1", "repo-1", ["src/app.ts"], "write");
    expect(mockDb.__state.insertCalls).toHaveLength(1);
  });

  it("blocks comment edits when path write permission is denied", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/config.yml"],
      reason: "Insufficient permissions for paths: secure/config.yml",
    });

    const response = await updateCommentPatch({
      params: { owner: "owner-1", repo: "demo", number: "42", commentId: "comment-1" },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/comments/comment-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "updated" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
    expect(mockDb.__mutationState.updateCalls).toHaveLength(0);
  });

  it("blocks comment deletion for non-admin when path write permission is denied", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/config.yml"],
      reason: "Insufficient permissions for paths: secure/config.yml",
    });

    const response = await deleteCommentDelete({
      params: { owner: "owner-1", repo: "demo", number: "42", commentId: "comment-1" },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/comments/comment-1", {
        method: "DELETE",
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
    expect(mockDb.__mutationState.deleteCalls).toHaveLength(0);
  });

  it("allows admin to delete comment even when path is restricted", async () => {
    getUserFromRequestMock.mockResolvedValue({ userId: "admin-1", isAdmin: true });
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/config.yml"],
      reason: "Insufficient permissions for paths: secure/config.yml",
    });

    const response = await deleteCommentDelete({
      params: { owner: "owner-1", repo: "demo", number: "42", commentId: "comment-1" },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/comments/comment-1", {
        method: "DELETE",
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.success).toBe(true);
    expect(mockDb.__mutationState.deleteCalls).toHaveLength(1);
  });
});
