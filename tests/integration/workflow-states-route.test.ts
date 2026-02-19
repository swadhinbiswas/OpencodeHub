import { beforeEach, describe, expect, it, vi } from "vitest";

const { canReadRepoMock, canAdminRepoMock, fakeSchema } = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canAdminRepoMock: vi.fn(async () => true),
  fakeSchema: {
    users: { username: {} },
    repositories: { name: {}, ownerId: {}, id: {} },
    prStateDefinitions: { repositoryId: {}, name: {}, id: {} },
    pullRequests: { stateId: {}, id: {} },
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

import { GET as getStates, POST as createState } from "@/pages/api/repos/[owner]/[repo]/workflow/states";
import { DELETE as deleteState } from "@/pages/api/repos/[owner]/[repo]/workflow/states/[id]";

function makeDb() {
  const owner = { id: "owner-1" };
  const repository = { id: "repo-1", ownerId: "owner-1", name: "demo" };
  const existingState = { id: "state-1", repositoryId: "repo-1", name: "in_review" };

  const insertCalls: unknown[] = [];
  const deleteCalls: unknown[] = [];

  return {
    query: {
      users: {
        findFirst: vi.fn(async () => owner),
      },
      repositories: {
        findFirst: vi.fn(async () => repository),
      },
      prStateDefinitions: {
        findMany: vi.fn(async () => [existingState]),
        findFirst: vi.fn(async (args?: any) => {
          if (args?.where) {
            // Existence checks in route; default to found.
            return existingState;
          }
          return existingState;
        }),
      },
      pullRequests: {
        findFirst: vi.fn(async () => null),
      },
    },
    $count: vi.fn(async () => 1),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: unknown) => {
        insertCalls.push(value);
        return [{ id: "new-state", name: "qa", repositoryId: "repo-1" }];
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async (value: unknown) => {
        deleteCalls.push(value);
      }),
    })),
    __state: { insertCalls, deleteCalls },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("workflow states route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    canAdminRepoMock.mockResolvedValue(true);
  });

  it("rejects GET when unauthenticated", async () => {
    const response = await getStates({
      params: { owner: "owner-1", repo: "demo" },
      locals: {},
    } as any);

    expect(response.status).toBe(401);
  });

  it("rejects duplicate state names on POST", async () => {
    const response = await createState({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "admin-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/workflow/states", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "In Review" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body?.error?.code).toBe("BAD_REQUEST");
  });

  it("blocks DELETE when state is assigned to pull requests", async () => {
    mockDb.query.pullRequests.findFirst.mockResolvedValueOnce({ id: "pr-1" });

    const response = await deleteState({
      params: { owner: "owner-1", repo: "demo", id: "state-1" },
      locals: { user: { id: "admin-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body?.error?.code).toBe("BAD_REQUEST");
    expect(mockDb.__state.deleteCalls).toHaveLength(0);
  });
});
