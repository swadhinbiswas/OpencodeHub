import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  suggestStackOrderMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  suggestStackOrderMock: vi.fn(async () => ({ order: ["pr-1", "pr-2"], cycles: [] })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { id: {}, repositoryId: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
}));

vi.mock("@/lib/pr-dependencies", () => ({
  suggestStackOrder: suggestStackOrderMock,
}));

import { POST as stackOrderPost } from "@/pages/api/repos/[owner]/[repo]/pulls/stack-order";

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
          { id: "pr-1", repositoryId: "repo-1" },
          { id: "pr-2", repositoryId: "repo-1" },
        ]),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("stack order suggestion route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    suggestStackOrderMock.mockResolvedValue({ order: ["pr-1", "pr-2"], cycles: [] });
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
});

