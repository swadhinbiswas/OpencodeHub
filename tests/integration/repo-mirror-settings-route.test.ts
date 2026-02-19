import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserFromRequestMock,
  canReadRepoMock,
  canAdminRepoMock,
  canWriteRepoMock,
  initializeMirrorMock,
  disableMirrorMock,
  syncMirrorRepositoryMock,
  fakeSchema,
} = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(async () => ({ userId: "user-1", isAdmin: false })),
  canReadRepoMock: vi.fn(async () => true),
  canAdminRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  initializeMirrorMock: vi.fn(async () => ({ success: true, refsUpdated: 3 })),
  disableMirrorMock: vi.fn(async () => ({ success: true })),
  syncMirrorRepositoryMock: vi.fn(async () => ({ success: true, refsUpdated: 2 })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
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
  canWriteRepo: canWriteRepoMock,
}));

vi.mock("@/lib/mirror-sync", () => ({
  initializeMirror: initializeMirrorMock,
  disableMirror: disableMirrorMock,
  syncMirrorRepository: syncMirrorRepositoryMock,
}));

import { GET as mirrorGet, POST as mirrorPost, DELETE as mirrorDelete } from "@/pages/api/repos/[owner]/[repo]/settings/mirror";
import { POST as mirrorSyncPost } from "@/pages/api/repos/[owner]/[repo]/settings/mirror/sync";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({
          id: "repo-1",
          ownerId: "owner-1",
          name: "demo",
          isMirror: true,
          mirrorUrl: "https://example.com/upstream.git",
          mirrorSyncStatus: "success",
          lastMirrorSyncAt: new Date("2026-02-19T00:00:00Z"),
        })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("repository mirror settings routes", () => {
  beforeEach(() => {
    mockDb = makeDb();
    getUserFromRequestMock.mockResolvedValue({ userId: "user-1", isAdmin: false });
    canReadRepoMock.mockResolvedValue(true);
    canAdminRepoMock.mockResolvedValue(true);
    canWriteRepoMock.mockResolvedValue(true);
    initializeMirrorMock.mockResolvedValue({ success: true, refsUpdated: 3 });
    disableMirrorMock.mockResolvedValue({ success: true });
    syncMirrorRepositoryMock.mockResolvedValue({ success: true, refsUpdated: 2 });
  });

  it("returns mirror settings for readers", async () => {
    const response = await mirrorGet({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/settings/mirror"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.isMirror).toBe(true);
  });

  it("configures mirror for repo admins", async () => {
    const response = await mirrorPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/settings/mirror", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mirrorUrl: "https://example.com/new-upstream.git" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.configured).toBe(true);
    expect(initializeMirrorMock).toHaveBeenCalledWith("repo-1", "https://example.com/new-upstream.git");
  });

  it("denies manual mirror sync without write access", async () => {
    canWriteRepoMock.mockResolvedValue(false);
    const response = await mirrorSyncPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/settings/mirror/sync", {
        method: "POST",
      }),
    } as any);

    expect(response.status).toBe(403);
  });

  it("disables mirror for admins", async () => {
    const response = await mirrorDelete({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/settings/mirror", {
        method: "DELETE",
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.configured).toBe(false);
    expect(disableMirrorMock).toHaveBeenCalledWith("repo-1");
  });
});

