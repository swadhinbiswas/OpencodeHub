import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canWriteRepoMock,
  canAdminRepoMock,
  bulkMergeStackMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canWriteRepoMock: vi.fn(async () => true),
  canAdminRepoMock: vi.fn(async () => false),
  bulkMergeStackMock: vi.fn(async () => ({
    success: true,
    merged: [{ prId: "pr-1", prNumber: 1 }],
    failed: [],
    skipped: [],
  })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    prStacks: { id: {}, repositoryId: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  canWriteRepo: canWriteRepoMock,
  canAdminRepo: canAdminRepoMock,
}));

vi.mock("@/lib/bulk-merge", () => ({
  bulkMergeStack: bulkMergeStackMock,
}));

import { POST as mergeStackPost } from "@/pages/api/repos/[owner]/[repo]/stacks/[stackId]/merge";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      prStacks: {
        findFirst: vi.fn(async () => ({ id: "stack-1", repositoryId: "repo-1" })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("stack merge route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canWriteRepoMock.mockResolvedValue(true);
    canAdminRepoMock.mockResolvedValue(false);
    bulkMergeStackMock.mockClear();
    bulkMergeStackMock.mockResolvedValue({
      success: true,
      merged: [{ prId: "pr-1", prNumber: 1 }],
      failed: [],
      skipped: [],
    });
  });

  it("returns forbidden when user lacks repo write permission", async () => {
    canWriteRepoMock.mockResolvedValue(false);

    const response = await mergeStackPost({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/stacks/stack-1/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mergeMethod: "merge" }),
      }),
    } as any);

    expect(response.status).toBe(403);
  });

  it("calls bulk merge with merge options", async () => {
    canAdminRepoMock.mockResolvedValue(true);

    const response = await mergeStackPost({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/stacks/stack-1/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mergeMethod: "squash", skipApprovalCheck: true }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.success).toBe(true);
    expect(bulkMergeStackMock).toHaveBeenCalledWith("stack-1", "user-1", {
      mergeMethod: "squash",
      skipApprovalCheck: true,
    });
  });

  it("forbids skipApprovalCheck for non-admin writers", async () => {
    canAdminRepoMock.mockResolvedValue(false);

    const response = await mergeStackPost({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/stacks/stack-1/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skipApprovalCheck: true }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
    expect(bulkMergeStackMock).not.toHaveBeenCalled();
  });
});
