import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canWriteRepoMock,
  bulkMergePRsMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canWriteRepoMock: vi.fn(async () => true),
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
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      pullRequests: {
        findMany: vi.fn(async () => [{ id: "pr-1" }, { id: "pr-2" }]),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("bulk merge route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canWriteRepoMock.mockResolvedValue(true);
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
  });
});
