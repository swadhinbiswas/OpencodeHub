import { beforeEach, describe, expect, it, vi } from "vitest";

const { canReadRepoMock, canWriteRepoMock, checkPathPermissionsMock, fakeSchema } = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
    pullRequestReviews: { id: {} },
    pullRequestComments: { id: {} },
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

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

vi.mock("@/lib/automations", () => ({
  triggerAutomation: vi.fn(async () => undefined),
}));

import { GET as reviewGet, POST as reviewPost } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/reviews";

function makeDb() {
  const owner = { id: "owner-1", username: "acme" };
  const repo = { id: "repo-1", ownerId: "owner-1", name: "demo" };
  const pr = { id: "pr-1", repositoryId: "repo-1", number: 42, authorId: "author-1" };
  const reviews = [
    {
      id: "rev-1",
      pullRequestId: "pr-1",
      state: "COMMENTED",
      reviewer: { id: "reviewer-1", username: "reviewer-1", displayName: "Reviewer One" },
      comments: [
        {
          id: "comment-1",
          path: "src/app.ts",
          body: "visible",
          author: { id: "reviewer-1", username: "reviewer-1", displayName: "Reviewer One" },
        },
        {
          id: "comment-2",
          path: "secure/secret.ts",
          body: "hidden",
          author: { id: "reviewer-2", username: "reviewer-2", displayName: "Reviewer Two" },
        },
      ],
    },
  ];

  const insertCalls: Array<{ table: unknown; value: unknown }> = [];

  return {
    query: {
      users: {
        findFirst: vi.fn(async () => owner),
      },
      repositories: {
        findFirst: vi.fn(async () => repo),
      },
      pullRequests: {
        findFirst: vi.fn(async () => pr),
      },
      pullRequestReviews: {
        findMany: vi.fn(async () => reviews),
      },
    },
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (value: unknown) => {
        insertCalls.push({ table, value });
      }),
    })),
    __state: {
      insertCalls,
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("single review route path permissions", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    canWriteRepoMock.mockResolvedValue(true);
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
  });

  it("returns 403 when review comment path is denied by path-scoped permissions", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/secret.ts"],
      reason: "Insufficient permissions for paths: secure/secret.ts",
    });

    const response = await reviewPost({
      params: { owner: "acme", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/acme/demo/pulls/42/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: "COMMENTED",
          comments: [{ body: "secure note", path: "secure/secret.ts", line: 5 }],
        }),
      }),
      locals: { user: { id: "reviewer-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
    expect(mockDb.__state.insertCalls).toHaveLength(0);
  });

  it("filters inline review comments for denied read paths", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/secret.ts"],
      reason: "Insufficient permissions for paths: secure/secret.ts",
    });

    const response = await reviewGet({
      params: { owner: "acme", repo: "demo", number: "42" },
      locals: { user: { id: "reviewer-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.reviews).toHaveLength(1);
    expect(body?.data?.reviews?.[0]?.comments).toHaveLength(1);
    expect(body?.data?.reviews?.[0]?.comments?.[0]?.path).toBe("src/app.ts");
    expect(body?.data?.hiddenCommentCount).toBe(1);
    expect(checkPathPermissionsMock).toHaveBeenCalledWith(
      "reviewer-1",
      "repo-1",
      ["src/app.ts", "secure/secret.ts"],
      "read"
    );
  });

  it("creates review and inline comment when path permissions pass", async () => {
    const response = await reviewPost({
      params: { owner: "acme", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/acme/demo/pulls/42/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: "COMMENTED",
          body: "looks good",
          comments: [{ body: "inline", path: "src/app.ts", line: 10 }],
        }),
      }),
      locals: { user: { id: "reviewer-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.commentCount).toBe(1);
    expect(checkPathPermissionsMock).toHaveBeenCalledWith("reviewer-1", "repo-1", ["src/app.ts"], "write");
    expect(mockDb.__state.insertCalls.length).toBe(2);
  });
});
