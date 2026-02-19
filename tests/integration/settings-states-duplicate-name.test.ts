import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRepoPermissionMock, fakeSchema } = vi.hoisted(() => ({
  getRepoPermissionMock: vi.fn(async () => "admin"),
  fakeSchema: {
    prStateDefinitions: { repositoryId: {}, name: {}, id: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  getRepoPermission: getRepoPermissionMock,
}));

import { POST as createState } from "@/pages/api/repos/[owner]/[repo]/settings/states";
import { PUT as updateState } from "@/pages/api/repos/[owner]/[repo]/settings/states/[id]";

function makeDb() {
  return {
    query: {
      prStateDefinitions: {
        findFirst: vi.fn(async (_args?: any) => ({ id: "existing-state", name: "in_review" })),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(async () => ({ returning: vi.fn(async () => []) })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    })),
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("settings states duplicate protection", () => {
  beforeEach(() => {
    mockDb = makeDb();
    getRepoPermissionMock.mockResolvedValue("admin");
  });

  it("rejects creating duplicate state name in repository", async () => {
    const response = await createState({
      locals: { repo: { id: "repo-1" }, user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner/demo/settings/states", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "In Review", displayName: "In Review" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body?.error?.code).toBe("BAD_REQUEST");
  });

  it("rejects updating state to duplicate name in repository", async () => {
    mockDb.query.prStateDefinitions.findFirst
      .mockResolvedValueOnce({ id: "state-2", name: "todo" })
      .mockResolvedValueOnce({ id: "state-1", name: "in_review" });

    const response = await updateState({
      params: { id: "state-2" },
      locals: { repo: { id: "repo-1" }, user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner/demo/settings/states/state-2", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "In Review" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body?.error?.code).toBe("BAD_REQUEST");
  });
});
