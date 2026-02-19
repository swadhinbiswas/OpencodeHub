import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canWriteRepoMock,
  getAutoMergeStatusMock,
  enableAutoMergeMock,
  disableAutoMergeMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
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
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      pullRequests: {
        findFirst: vi.fn(async () => ({ id: "pr-1", repositoryId: "repo-1", number: 12 })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("pull request auto-merge route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    canWriteRepoMock.mockResolvedValue(true);
    getAutoMergeStatusMock.mockResolvedValue({
      enabled: true,
      eligibleToMerge: false,
      blockers: ["1 pending check(s)"],
    });
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
  });

  it("disables auto-merge for writers", async () => {
    const response = await autoMergeDelete({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    expect(response.status).toBe(200);
    expect(disableAutoMergeMock).toHaveBeenCalledWith("pr-1");
  });
});
