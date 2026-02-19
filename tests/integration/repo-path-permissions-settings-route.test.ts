import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserFromRequestMock,
  canReadRepoMock,
  canAdminRepoMock,
  getPathPermissionsMock,
  fakeSchema,
} = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(async () => ({ userId: "user-1", isAdmin: false })),
  canReadRepoMock: vi.fn(async () => true),
  canAdminRepoMock: vi.fn(async () => true),
  getPathPermissionsMock: vi.fn(async () => ([
    {
      id: "perm-1",
      repositoryId: "repo-1",
      pathPattern: "packages/web/**",
      userId: "user-1",
      teamId: null,
      permission: "write",
      requireApproval: "false",
      createdAt: new Date("2026-02-19T00:00:00Z"),
      updatedAt: new Date("2026-02-19T00:00:00Z"),
    },
  ])),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    repositoryPathPermissions: { id: {}, repositoryId: {} },
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

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
  canAdminRepo: canAdminRepoMock,
}));

vi.mock("@/lib/path-scoping", () => ({
  getPathPermissions: getPathPermissionsMock,
}));

import { GET as pathPermissionsGet, POST as pathPermissionsPost } from "@/pages/api/repos/[owner]/[repo]/settings/path-permissions";
import { PUT as pathPermissionsPut, DELETE as pathPermissionsDelete } from "@/pages/api/repos/[owner]/[repo]/settings/path-permissions/[id]";

function makeDb() {
  const owner = { id: "owner-1", username: "acme" };
  const repo = { id: "repo-1", ownerId: "owner-1", name: "demo" };
  const pathPermission = {
    id: "perm-1",
    repositoryId: "repo-1",
    pathPattern: "packages/web/**",
    userId: "user-1",
    teamId: null,
    permission: "write",
    requireApproval: "false",
  };

  const insertCalls: Array<unknown> = [];
  const updateCalls: Array<unknown> = [];
  const deleteCalls: Array<unknown> = [];

  return {
    query: {
      users: {
        findFirst: vi.fn(async () => owner),
      },
      repositories: {
        findFirst: vi.fn(async () => repo),
      },
      repositoryPathPermissions: {
        findFirst: vi.fn(async () => pathPermission),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(async (value: unknown) => {
        insertCalls.push(value);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((value: unknown) => {
        updateCalls.push(value);
        return {
          where: vi.fn(async () => undefined),
        };
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async (value: unknown) => {
        deleteCalls.push(value);
      }),
    })),
    __state: {
      insertCalls,
      updateCalls,
      deleteCalls,
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("repository path permissions settings routes", () => {
  beforeEach(() => {
    mockDb = makeDb();
    getUserFromRequestMock.mockResolvedValue({ userId: "user-1", isAdmin: false });
    canReadRepoMock.mockResolvedValue(true);
    canAdminRepoMock.mockResolvedValue(true);
  });

  it("lists path permission rules for readers", async () => {
    const response = await pathPermissionsGet({
      params: { owner: "acme", repo: "demo" },
      request: new Request("http://localhost/api/repos/acme/demo/settings/path-permissions"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.rules).toHaveLength(1);
    expect(body?.data?.summary?.totalRules).toBe(1);
  });

  it("creates a path permission for repo admins", async () => {
    const response = await pathPermissionsPost({
      params: { owner: "acme", repo: "demo" },
      request: new Request("http://localhost/api/repos/acme/demo/settings/path-permissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathPattern: "packages/api/**",
          teamId: "team-1",
          permission: "write",
          requireApproval: true,
        }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(201);
    expect(body?.data?.pathPattern).toBe("packages/api/**");
    expect(body?.data?.teamId).toBe("team-1");
    expect(body?.data?.requireApproval).toBe("true");
    expect(mockDb.__state.insertCalls).toHaveLength(1);
  });

  it("rejects creation when neither userId nor teamId is provided", async () => {
    const response = await pathPermissionsPost({
      params: { owner: "acme", repo: "demo" },
      request: new Request("http://localhost/api/repos/acme/demo/settings/path-permissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathPattern: "packages/shared/**",
          permission: "read",
        }),
      }),
    } as any);

    expect(response.status).toBe(400);
    expect(mockDb.__state.insertCalls).toHaveLength(0);
  });

  it("updates a rule for repo admins", async () => {
    const response = await pathPermissionsPut({
      params: { owner: "acme", repo: "demo", id: "perm-1" },
      request: new Request("http://localhost/api/repos/acme/demo/settings/path-permissions/perm-1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathPattern: "packages/mobile/**",
          permission: "admin",
          requireApproval: true,
        }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.updated).toBe(true);
    expect(mockDb.__state.updateCalls).toHaveLength(1);
  });

  it("deletes a rule for repo admins", async () => {
    const response = await pathPermissionsDelete({
      params: { owner: "acme", repo: "demo", id: "perm-1" },
      request: new Request("http://localhost/api/repos/acme/demo/settings/path-permissions/perm-1", {
        method: "DELETE",
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.deleted).toBe(true);
    expect(mockDb.__state.deleteCalls).toHaveLength(1);
  });
});
