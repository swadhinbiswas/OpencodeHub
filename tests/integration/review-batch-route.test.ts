import { beforeEach, describe, expect, it, vi } from "vitest";

const { canReadRepoMock, canWriteRepoMock, triggerAutomationMock, checkPathPermissionsMock, fakeSchema } = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  triggerAutomationMock: vi.fn(async () => undefined),
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

vi.mock("@/lib/automations", () => ({
  triggerAutomation: triggerAutomationMock,
}));

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

import { POST as batchReviewPost } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/reviews/batch";

function makeDb(options?: { failCommentInsert?: boolean }) {
  const owner = { id: "owner-1", username: "acme" };
  const repo = { id: "repo-1", ownerId: "owner-1", name: "demo" };
  const pr = { id: "pr-1", repositoryId: "repo-1", number: 42, authorId: "author-1" };

  const insertCalls: Array<{ table: unknown; value: unknown }> = [];
  const deleteTables: unknown[] = [];

  let commentInsertCount = 0;

  const db = {
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
    },
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (value: unknown) => {
        insertCalls.push({ table, value });

        if (table === fakeSchema.pullRequestComments) {
          commentInsertCount += 1;
          if (options?.failCommentInsert && commentInsertCount === 2) {
            throw new Error("comment insert failed");
          }
        }
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(async () => {
        deleteTables.push(table);
      }),
    })),
    __state: {
      insertCalls,
      deleteTables,
    },
  };

  return db;
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("batch review route", () => {
  beforeEach(() => {
    canReadRepoMock.mockResolvedValue(true);
    canWriteRepoMock.mockResolvedValue(true);
    triggerAutomationMock.mockClear();
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
  });

  it("returns 401 when user is not authenticated", async () => {
    mockDb = makeDb();

    const response = await batchReviewPost({
      params: { owner: "acme", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/acme/demo/pulls/42/reviews/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: "COMMENTED",
          comments: [{ body: "looks good" }],
        }),
      }),
      locals: {},
    } as any);

    expect(response.status).toBe(401);
  });

  it("returns 403 for APPROVED when user lacks write access", async () => {
    mockDb = makeDb();
    canWriteRepoMock.mockResolvedValue(false);

    const response = await batchReviewPost({
      params: { owner: "acme", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/acme/demo/pulls/42/reviews/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: "APPROVED",
          comments: [{ body: "approved" }],
        }),
      }),
      locals: { user: { id: "reviewer-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
  });

  it("submits review and comments in one request", async () => {
    mockDb = makeDb();

    const response = await batchReviewPost({
      params: { owner: "acme", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/acme/demo/pulls/42/reviews/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: "COMMENTED",
          body: "batch summary",
          comments: [{ body: "c1" }, { body: "c2" }],
        }),
      }),
      locals: { user: { id: "reviewer-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.data?.commentCount).toBe(2);

    const reviewInserts = mockDb.__state.insertCalls.filter(
      (entry: any) => entry.table === fakeSchema.pullRequestReviews
    );
    const commentInserts = mockDb.__state.insertCalls.filter(
      (entry: any) => entry.table === fakeSchema.pullRequestComments
    );
    expect(reviewInserts).toHaveLength(1);
    expect(commentInserts).toHaveLength(2);
  });

  it("returns 403 when path-scoped permissions deny any review comment path", async () => {
    mockDb = makeDb();
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/secret.ts"],
      reason: "Insufficient permissions for paths: secure/secret.ts",
    });

    const response = await batchReviewPost({
      params: { owner: "acme", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/acme/demo/pulls/42/reviews/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: "COMMENTED",
          comments: [{ body: "secure change", path: "secure/secret.ts", line: 10 }],
        }),
      }),
      locals: { user: { id: "reviewer-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
    expect(checkPathPermissionsMock).toHaveBeenCalledWith(
      "reviewer-1",
      "repo-1",
      ["secure/secret.ts"],
      "write"
    );
  });

  it("rolls back created rows when comment insert fails mid-batch", async () => {
    mockDb = makeDb({ failCommentInsert: true });

    const response = await batchReviewPost({
      params: { owner: "acme", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/acme/demo/pulls/42/reviews/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: "COMMENTED",
          comments: [{ body: "c1" }, { body: "c2" }],
        }),
      }),
      locals: { user: { id: "reviewer-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(500);
    expect(body?.error?.code).toBe("INTERNAL_ERROR");

    // One cleanup delete for comments + one for the review record.
    expect(mockDb.__state.deleteTables).toContain(fakeSchema.pullRequestComments);
    expect(mockDb.__state.deleteTables).toContain(fakeSchema.pullRequestReviews);
  });
});
