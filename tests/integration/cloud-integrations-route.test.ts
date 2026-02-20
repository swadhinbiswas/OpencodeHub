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
    cloudConfigs: { repositoryId: {}, provider: {}, updatedAt: {}, id: {} },
    deployments: { configId: {}, createdAt: {} },
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

import { GET as cloudGet, POST as cloudPost } from "@/pages/api/repos/[owner]/[repo]/integrations/cloud";
import { DELETE as cloudDelete, PATCH as cloudPatch } from "@/pages/api/repos/[owner]/[repo]/integrations/cloud/[id]";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      cloudConfigs: {
        findMany: vi.fn(async () => ([
          {
            id: "cfg-aws",
            repositoryId: "repo-1",
            provider: "aws",
            name: "AWS",
            region: "us-east-1",
            credentials: { accessKeyId: "AKIA", secretAccessKey: "sec" },
            settings: null,
            isEnabled: true,
            updatedAt: new Date(),
          },
        ])),
        findFirst: vi.fn(async () => null),
      },
      deployments: {
        findMany: vi.fn(async () => ([
          {
            id: "dep-1",
            configId: "cfg-aws",
            status: "success",
            commitSha: "abc123",
            createdAt: new Date(),
          },
        ])),
      },
    },
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  };
}

async function json(response: Response): Promise<any> {
  return response.json();
}

describe("cloud integrations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns providers and configs", async () => {
    const response = await cloudGet({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/cloud"),
      url: new URL("http://localhost/api/repos/owner-1/demo/integrations/cloud"),
    } as any);

    const body = await json(response);
    expect(response.status).toBe(200);
    expect(body?.data?.providers?.length).toBe(5);
    expect(body?.data?.configs?.[0]?.provider).toBe("aws");
    expect(body?.data?.configs?.[0]?.credentials).toBeUndefined();
    expect(body?.data?.configs?.[0]?.hasCredentials).toBe(true);
  });

  it("returns deployment summary with summary=1", async () => {
    const response = await cloudGet({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/cloud?summary=1"),
      url: new URL("http://localhost/api/repos/owner-1/demo/integrations/cloud?summary=1"),
    } as any);

    const body = await json(response);
    expect(response.status).toBe(200);
    expect(body?.data?.deployments?.length).toBe(1);
    expect(body?.data?.deployments?.[0]?.status).toBe("success");
  });

  it("creates provider configs for all supported cloud providers", async () => {
    mockDb.query.cloudConfigs.findFirst = vi.fn(async () => null);

    for (const provider of ["aws", "gcp", "azure", "kubernetes", "terraform"] as const) {
      const response = await cloudPost({
        params: { owner: "owner-1", repo: "demo" },
        request: new Request("http://localhost/api/repos/owner-1/demo/integrations/cloud", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider,
            name: provider,
            region: "us-east-1",
            credentials: { token: "secret" },
            isEnabled: true,
          }),
        }),
      } as any);

      expect(response.status).toBe(200);
    }

    expect(mockDb.insert).toHaveBeenCalledTimes(5);
  });

  it("patches and deletes cloud config", async () => {
    mockDb.query.cloudConfigs.findFirst = vi.fn(async () => ({
      id: "cfg-aws",
      repositoryId: "repo-1",
      provider: "aws",
      credentials: { accessKeyId: "AKIA" },
    }));

    const patchResponse = await cloudPatch({
      params: { owner: "owner-1", repo: "demo", id: "cfg-aws" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/cloud/cfg-aws", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isEnabled: false }),
      }),
    } as any);

    expect(patchResponse.status).toBe(200);
    expect(mockDb.update).toHaveBeenCalledTimes(1);

    const deleteResponse = await cloudDelete({
      params: { owner: "owner-1", repo: "demo", id: "cfg-aws" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/cloud/cfg-aws", {
        method: "DELETE",
      }),
    } as any);

    const body = await json(deleteResponse);
    expect(deleteResponse.status).toBe(200);
    expect(body?.data?.deleted).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
  });
});
