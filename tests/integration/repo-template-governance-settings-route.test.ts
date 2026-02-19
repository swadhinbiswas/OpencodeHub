import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserFromRequestMock,
  canReadRepoMock,
  canAdminRepoMock,
  fakeSchema,
} = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(async () => ({ userId: "user-1", isAdmin: false })),
  canReadRepoMock: vi.fn(async () => true),
  canAdminRepoMock: vi.fn(async () => true),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    repositoryCollaborators: { repositoryId: {}, id: {} },
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

import { GET as templateSettingsGet, PUT as templateSettingsPut } from "@/pages/api/repos/[owner]/[repo]/settings/template";

function makeDb(overrides?: Partial<Record<string, unknown>>) {
  const repo = {
    id: "repo-1",
    ownerId: "owner-1",
    name: "demo",
    visibility: "private",
    isTemplate: false,
    isArchived: false,
    isMirror: false,
    ...(overrides || {}),
  };

  const updateCalls: Array<unknown> = [];

  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => repo),
      },
      repositoryCollaborators: {
        findMany: vi.fn(async () => [{ id: "col-1" }, { id: "col-2" }]),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn((value: unknown) => {
        updateCalls.push(value);
        return {
          where: vi.fn(async () => undefined),
        };
      }),
    })),
    __state: { updateCalls },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("repository template governance settings route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    getUserFromRequestMock.mockResolvedValue({ userId: "user-1", isAdmin: false });
    canReadRepoMock.mockResolvedValue(true);
    canAdminRepoMock.mockResolvedValue(true);
  });

  it("returns governance details for readers", async () => {
    const response = await templateSettingsGet({
      params: { owner: "acme", repo: "demo" },
      request: new Request("http://localhost/api/repos/acme/demo/settings/template"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.governance?.collaboratorCount).toBe(2);
    expect(body?.data?.templatePolicy?.catalogScope).toBe("disabled");
  });

  it("requires explicit acknowledgment when publishing a private template", async () => {
    const response = await templateSettingsPut({
      params: { owner: "acme", repo: "demo" },
      request: new Request("http://localhost/api/repos/acme/demo/settings/template", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isTemplate: true }),
      }),
    } as any);

    expect(response.status).toBe(400);
    expect(mockDb.__state.updateCalls).toHaveLength(0);
  });

  it("publishes template when private-risk acknowledgment is provided", async () => {
    const response = await templateSettingsPut({
      params: { owner: "acme", repo: "demo" },
      request: new Request("http://localhost/api/repos/acme/demo/settings/template", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isTemplate: true,
          acknowledgePrivateCatalogRisk: true,
        }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.updated).toBe(true);
    expect(body?.data?.templatePolicy?.catalogScope).toBe("private-collaborators");
    expect(mockDb.__state.updateCalls).toHaveLength(1);
  });

  it("blocks publishing archived repositories as templates", async () => {
    mockDb = makeDb({ isArchived: true });

    const response = await templateSettingsPut({
      params: { owner: "acme", repo: "demo" },
      request: new Request("http://localhost/api/repos/acme/demo/settings/template", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isTemplate: true,
          acknowledgePrivateCatalogRisk: true,
        }),
      }),
    } as any);

    expect(response.status).toBe(400);
  });
});
