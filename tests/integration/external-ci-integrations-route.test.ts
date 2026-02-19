import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canWriteRepoMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    externalCIConfigs: { repositoryId: {}, provider: {}, updatedAt: {}, id: {} },
    externalBuilds: { configId: {}, createdAt: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: vi.fn(async () => ({ userId: "user-1", isAdmin: false })),
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
  canWriteRepo: canWriteRepoMock,
}));

import { GET as externalCiIntegrationsGet, POST as externalCiIntegrationsPost } from "@/pages/api/repos/[owner]/[repo]/integrations/external-ci";
import { DELETE as externalCiIntegrationDelete, PATCH as externalCiIntegrationPatch } from "@/pages/api/repos/[owner]/[repo]/integrations/external-ci/[id]";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      externalCIConfigs: {
        findMany: vi.fn(async () => ([
          {
            id: "cfg-gitlab",
            repositoryId: "repo-1",
            provider: "gitlab",
            name: "GitLab CI",
            baseUrl: "https://gitlab.com",
            projectId: "acme%2Fdemo",
            apiToken: "secret",
            webhookSecret: "webhook-1",
            isEnabled: true,
            syncStatus: true,
            updatedAt: new Date(),
          },
        ])),
        findFirst: vi.fn(async () => null),
      },
      externalBuilds: {
        findMany: vi.fn(async () => ([
          {
            id: "build-1",
            configId: "cfg-gitlab",
            externalBuildId: "123",
            buildNumber: "123",
            status: "success",
            createdAt: new Date(),
          },
        ])),
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

describe("external ci integrations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns provider matrix and configs", async () => {
    const response = await externalCiIntegrationsGet({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/external-ci"),
      url: new URL("http://localhost/api/repos/owner-1/demo/integrations/external-ci"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.providers?.length).toBe(4);
    expect(body?.data?.configs?.[0]?.provider).toBe("gitlab");
    expect(body?.data?.configs?.[0]?.apiToken).toBeUndefined();
  });

  it("returns builds summary when summary=1", async () => {
    const response = await externalCiIntegrationsGet({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/external-ci?summary=1"),
      url: new URL("http://localhost/api/repos/owner-1/demo/integrations/external-ci?summary=1"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.builds?.length).toBe(1);
    expect(body?.data?.builds?.[0]?.status).toBe("success");
  });

  it("creates provider config", async () => {
    mockDb.query.externalCIConfigs.findFirst = vi.fn(async () => null);

    const response = await externalCiIntegrationsPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/external-ci", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "gitlab",
          name: "GitLab CI",
          baseUrl: "https://gitlab.com",
          projectId: "acme%2Fdemo",
          apiToken: "token-1",
          syncStatus: true,
          isEnabled: true,
        }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.provider).toBe("gitlab");
    expect(body?.data?.apiToken).toBeUndefined();
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it("patches and deletes an external ci config", async () => {
    mockDb.query.externalCIConfigs.findFirst = vi.fn(async () => ({
      id: "cfg-gitlab",
      repositoryId: "repo-1",
      provider: "gitlab",
    }));

    const patchResponse = await externalCiIntegrationPatch({
      params: { owner: "owner-1", repo: "demo", id: "cfg-gitlab" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/external-ci/cfg-gitlab", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isEnabled: false }),
      }),
    } as any);

    expect(patchResponse.status).toBe(200);
    expect(mockDb.update).toHaveBeenCalledTimes(1);

    const deleteResponse = await externalCiIntegrationDelete({
      params: { owner: "owner-1", repo: "demo", id: "cfg-gitlab" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/external-ci/cfg-gitlab", {
        method: "DELETE",
      }),
    } as any);

    const deleteBody = await readJson(deleteResponse);
    expect(deleteResponse.status).toBe(200);
    expect(deleteBody?.data?.deleted).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
  });
});
