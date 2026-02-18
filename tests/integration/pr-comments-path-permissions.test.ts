import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserFromRequestMock, checkPathPermissionsMock, fakeSchema } = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(async () => ({ userId: "user-1", isAdmin: false })),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  fakeSchema: {
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

import { POST as createCommentPost } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/comments";

function makeDb() {
  const pr = {
    id: "pr-1",
    repositoryId: "repo-1",
    repository: { id: "repo-1", ownerId: "owner-1" },
  };
  const insertCalls: unknown[] = [];

  return {
    query: {
      pullRequests: {
        findFirst: vi.fn(async () => pr),
      },
      pullRequestComments: {
        findFirst: vi.fn(async () => ({ id: "comment-1", author: { username: "user-1" } })),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(async (value: unknown) => {
        insertCalls.push(value);
      }),
    })),
    __state: { insertCalls },
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
});
