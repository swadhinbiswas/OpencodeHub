import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canAdminRepoMock,
  generateIdMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canAdminRepoMock: vi.fn(async () => true),
  generateIdMock: vi.fn(() => "external_ci_1"),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    externalCiIntegrations: { repositoryId: {}, id: {}, updatedAt: {}, tokenHash: {}, name: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  canAdminRepo: canAdminRepoMock,
}));

vi.mock("@/lib/utils", () => ({
  generateId: generateIdMock,
}));

import { DELETE as externalCiDelete, GET as externalCiGet, POST as externalCiPost } from "@/pages/api/repos/[owner]/[repo]/external-ci";

function makeDb(integration: any | null = null) {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      externalCiIntegrations: {
        findFirst: vi.fn(async () => integration),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(async () => undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("external ci route", () => {
  beforeEach(() => {
    canAdminRepoMock.mockResolvedValue(true);
    generateIdMock.mockReturnValue("external_ci_1");
    mockDb = makeDb(null);
  });

  it("returns disabled when integration is missing", async () => {
    const response = await externalCiGet({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.enabled).toBe(false);
  });

  it("returns status metadata when integration exists", async () => {
    const lastUsedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    mockDb = makeDb({
      id: "external-ci-1",
      repositoryId: "repo-1",
      name: "External CI",
      createdAt: new Date("2026-02-01T00:00:00Z"),
      updatedAt: new Date("2026-02-15T00:00:00Z"),
      lastUsedAt,
    });

    const response = await externalCiGet({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.enabled).toBe(true);
    expect(body?.data?.status).toBe("active");
    expect(typeof body?.data?.checksEndpoint).toBe("string");
  });

  it("returns rotated=true when token is regenerated", async () => {
    mockDb = makeDb({
      id: "external-ci-1",
      repositoryId: "repo-1",
      name: "External CI",
    });

    const response = await externalCiPost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/external-ci", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed CI" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(201);
    expect(typeof body?.data?.token).toBe("string");
    expect(body?.data?.rotated).toBe(true);
  });

  it("disables integration with delete", async () => {
    mockDb = makeDb({
      id: "external-ci-1",
      repositoryId: "repo-1",
      name: "External CI",
    });

    const response = await externalCiDelete({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.enabled).toBe(false);
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
  });
});
