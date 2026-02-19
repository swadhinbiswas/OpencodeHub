import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canWriteRepoMock,
  suggestStackOrderMock,
  createStackMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  suggestStackOrderMock: vi.fn(async () => ({ order: ["pr-1", "pr-2"], cycles: [] })),
  createStackMock: vi.fn(async () => ({
    id: "stack-1",
    name: "Dependency stack",
    baseBranch: "main",
    status: "active",
  })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { id: {}, repositoryId: {}, state: {} },
    prStackEntries: { pullRequestId: {}, id: {}, stackId: {} },
    prStacks: { repositoryId: {}, id: {} },
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

vi.mock("@/lib/pr-dependencies", () => ({
  suggestStackOrder: suggestStackOrderMock,
}));

vi.mock("@/lib/stacks", () => ({
  createStack: createStackMock,
}));

import { POST as stackOrderPost, PUT as stackOrderPut } from "@/pages/api/repos/[owner]/[repo]/pulls/stack-order";

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
        findMany: vi.fn(async () => [
          { id: "pr-1", repositoryId: "repo-1", number: 1, title: "PR 1", state: "open", baseBranch: "main" },
          { id: "pr-2", repositoryId: "repo-1", number: 2, title: "PR 2", state: "open", baseBranch: "feature-1" },
        ]),
      },
      prStackEntries: {
        findMany: vi.fn(async () => []),
      },
      prStacks: {
        findMany: vi.fn(async () => []),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(async () => undefined),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("stack order suggestion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    canWriteRepoMock.mockResolvedValue(true);
    suggestStackOrderMock.mockResolvedValue({ order: ["pr-1", "pr-2"], cycles: [] });
    createStackMock.mockResolvedValue({
      id: "stack-1",
      name: "Dependency stack",
      baseBranch: "main",
      status: "active",
    });
  });

  it("returns suggested ordering for valid PR IDs", async () => {
    const response = await stackOrderPost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/stack-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prIds: ["pr-1", "pr-2"] }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.order).toEqual(["pr-1", "pr-2"]);
    expect(suggestStackOrderMock).toHaveBeenCalledWith(["pr-1", "pr-2"]);
  });

  it("rejects PR IDs outside the target repository", async () => {
    mockDb.query.pullRequests.findMany.mockResolvedValueOnce([
      { id: "pr-1", repositoryId: "repo-1" },
      { id: "pr-2", repositoryId: "repo-2" },
    ]);

    const response = await stackOrderPost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/stack-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prIds: ["pr-1", "pr-2"] }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body?.error?.code).toBe("BAD_REQUEST");
  });

  it("applies suggested stack order and creates stack entries", async () => {
    const response = await stackOrderPut({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/stack-order", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prIds: ["pr-1", "pr-2"], name: "API cleanup stack" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(createStackMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      baseBranch: "main",
      name: "API cleanup stack",
      createdById: "user-1",
    });
    expect(body?.data?.stackId).toBe("stack-1");
    expect(body?.data?.order).toHaveLength(2);
  });

  it("rejects apply when dependency cycles are detected", async () => {
    suggestStackOrderMock.mockResolvedValueOnce({ order: ["pr-1", "pr-2"], cycles: [["pr-1", "pr-2"]] });

    const response = await stackOrderPut({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/stack-order", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prIds: ["pr-1", "pr-2"] }),
      }),
    } as any);

    expect(response.status).toBe(400);
    expect(createStackMock).not.toHaveBeenCalled();
  });
});
