import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserFromRequestMock,
  canReadRepoMock,
  canAdminRepoMock,
  canWriteRepoMock,
  initializeMirrorMock,
  disableMirrorMock,
  syncMirrorRepositoryMock,
  configurePushMirrorMock,
  removePushMirrorMock,
  pushMirrorNowMock,
  fakeSchema,
} = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(async () => ({ userId: "user-1", isAdmin: false })),
  canReadRepoMock: vi.fn(async () => true),
  canAdminRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  initializeMirrorMock: vi.fn(async () => ({ success: true, refsUpdated: 3 })),
  disableMirrorMock: vi.fn(async () => ({ success: true })),
  syncMirrorRepositoryMock: vi.fn(async () => ({ success: true, refsUpdated: 2 })),
  configurePushMirrorMock: vi.fn(async () => ({
    success: true,
    config: { enabled: true, url: "https://example.com/target.git", hasToken: false, status: "pending", lastPushMirrorAt: null },
  })),
  removePushMirrorMock: vi.fn(async () => ({ success: true })),
  pushMirrorNowMock: vi.fn(async () => ({ success: true, refsUpdated: 4, durationMs: 12 })),
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

vi.mock("@/lib/push-mirror", () => ({
  configurePushMirror: configurePushMirrorMock,
  removePushMirror: removePushMirrorMock,
  pushMirrorNow: pushMirrorNowMock,
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
          pushMirrorEnabled: true,
          pushMirrorUrl: "https://example.com/target.git",
          pushMirrorToken: "encrypted-token",
          pushMirrorStatus: "success",
          lastPushMirrorAt: new Date("2026-02-20T00:00:00Z"),
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
    vi.clearAllMocks();
    mockDb = makeDb();
    getUserFromRequestMock.mockResolvedValue({ userId: "user-1", isAdmin: false });
    canReadRepoMock.mockResolvedValue(true);
    canAdminRepoMock.mockResolvedValue(true);
    canWriteRepoMock.mockResolvedValue(true);
    initializeMirrorMock.mockResolvedValue({ success: true, refsUpdated: 3 });
    disableMirrorMock.mockResolvedValue({ success: true });
    syncMirrorRepositoryMock.mockResolvedValue({ success: true, refsUpdated: 2 });
    configurePushMirrorMock.mockResolvedValue({
      success: true,
      config: { enabled: true, url: "https://example.com/target.git", hasToken: false, status: "pending", lastPushMirrorAt: null },
    });
    removePushMirrorMock.mockResolvedValue({ success: true });
    pushMirrorNowMock.mockResolvedValue({ success: true, refsUpdated: 4, durationMs: 12 });
  });

  it("returns mirror settings for readers", async () => {
    const response = await mirrorGet({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/settings/mirror"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.isMirror).toBe(true);
    expect(typeof body?.data?.isHealthy).toBe("boolean");
    expect(typeof body?.data?.isStale).toBe("boolean");
    expect(body?.data?.push).toMatchObject({
      enabled: true,
      url: "https://example.com/target.git",
      status: "success",
      hasToken: true,
    });
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
    expect(removePushMirrorMock).toHaveBeenCalledWith("repo-1");
  });

  it("configures push mirror for repo admins", async () => {
    const response = await mirrorPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/settings/mirror", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          push: { enabled: true, url: "https://example.com/target.git", authToken: "tok-123" },
        }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.push).toEqual({ configured: true });
    expect(configurePushMirrorMock).toHaveBeenCalledWith("repo-1", {
      url: "https://example.com/target.git",
      authToken: "tok-123",
    });
  });

  it("rejects push config without url when enabling", async () => {
    const response = await mirrorPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/settings/mirror", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ push: { enabled: true } }),
      }),
    } as any);

    expect(response.status).toBe(400);
  });

  it("removes push mirror when disabled via POST", async () => {
    const response = await mirrorPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/settings/mirror", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ push: { enabled: false } }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.push).toEqual({ configured: false });
    expect(removePushMirrorMock).toHaveBeenCalledWith("repo-1");
  });

  it("runs manual push-only sync when direction=push", async () => {
    const response = await mirrorSyncPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request(
        "http://localhost/api/repos/owner-1/demo/settings/mirror/sync?direction=push",
        { method: "POST" }
      ),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(pushMirrorNowMock).toHaveBeenCalledWith("repo-1");
    expect(syncMirrorRepositoryMock).not.toHaveBeenCalled();
    expect(body?.data?.direction).toBe("push");
    expect(body?.data?.refsUpdated).toBe(4);
  });

  it("syncs both directions when direction=both", async () => {
    const response = await mirrorSyncPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request(
        "http://localhost/api/repos/owner-1/demo/settings/mirror/sync?direction=both",
        { method: "POST" }
      ),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(syncMirrorRepositoryMock).toHaveBeenCalledWith("repo-1");
    expect(pushMirrorNowMock).toHaveBeenCalledWith("repo-1");
    expect(body?.data?.pull).toMatchObject({ success: true });
    expect(body?.data?.push).toMatchObject({ success: true });
  });

  it("defaults to pull sync preserving legacy behavior", async () => {
    const response = await mirrorSyncPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request(
        "http://localhost/api/repos/owner-1/demo/settings/mirror/sync",
        { method: "POST" }
      ),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(syncMirrorRepositoryMock).toHaveBeenCalledWith("repo-1");
    expect(pushMirrorNowMock).not.toHaveBeenCalled();
    expect(body?.data?.refsUpdated).toBe(2);
  });

  it("rejects invalid direction values", async () => {
    const response = await mirrorSyncPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request(
        "http://localhost/api/repos/owner-1/demo/settings/mirror/sync?direction=sideways",
        { method: "POST" }
      ),
    } as any);

    expect(response.status).toBe(400);
  });
});
