import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canAdminRepoMock,
  toggleGateMock,
  removeRequiredCheckMock,
  removeMergeGateMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canAdminRepoMock: vi.fn(async () => true),
  toggleGateMock: vi.fn(async () => true),
  removeRequiredCheckMock: vi.fn(async () => true),
  removeMergeGateMock: vi.fn(async () => true),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    mergeGates: { id: {}, repositoryId: {} },
    requiredStatusChecks: { id: {}, repositoryId: {} },
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

vi.mock("@/lib/ci-gates", () => ({
  toggleGate: toggleGateMock,
  removeRequiredCheck: removeRequiredCheckMock,
  removeMergeGate: removeMergeGateMock,
}));

import {
  PATCH as mergeGatePatch,
  DELETE as mergeGateDelete,
} from "@/pages/api/repos/[owner]/[repo]/merge-gates/[id]";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      mergeGates: {
        findFirst: vi.fn(async () => ({ id: "gate-1", repositoryId: "repo-1", isEnabled: true })),
      },
      requiredStatusChecks: {
        findFirst: vi.fn(async () => null),
      },
    },
  };
}

describe("merge gate item route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    canAdminRepoMock.mockResolvedValue(true);
    toggleGateMock.mockResolvedValue(true);
    removeRequiredCheckMock.mockResolvedValue(true);
    removeMergeGateMock.mockResolvedValue(true);
  });

  it("updates merge gate enabled state for admins", async () => {
    const response = await mergeGatePatch({
      params: { owner: "owner-1", repo: "demo", id: "gate-1" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/merge-gates/gate-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
    } as any);

    expect(response.status).toBe(200);
    expect(toggleGateMock).toHaveBeenCalledWith("gate-1", false);
  });

  it("returns 403 for non-admin updates", async () => {
    canAdminRepoMock.mockResolvedValue(false);
    const response = await mergeGatePatch({
      params: { owner: "owner-1", repo: "demo", id: "gate-1" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/merge-gates/gate-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(toggleGateMock).not.toHaveBeenCalled();
  });

  it("deletes required check when id maps to required check", async () => {
    mockDb.query.requiredStatusChecks.findFirst = vi.fn(async () => ({
      id: "check-1",
      repositoryId: "repo-1",
    }));

    const response = await mergeGateDelete({
      params: { owner: "owner-1", repo: "demo", id: "check-1" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    expect(response.status).toBe(200);
    expect(removeRequiredCheckMock).toHaveBeenCalledWith("check-1");
    expect(removeMergeGateMock).not.toHaveBeenCalled();
  });

  it("deletes merge gate when id maps to gate", async () => {
    const response = await mergeGateDelete({
      params: { owner: "owner-1", repo: "demo", id: "gate-1" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    expect(response.status).toBe(200);
    expect(removeMergeGateMock).toHaveBeenCalledWith("gate-1");
  });

  it("returns 404 when entry is not found for delete", async () => {
    mockDb.query.mergeGates.findFirst = vi.fn(async () => null);
    const response = await mergeGateDelete({
      params: { owner: "owner-1", repo: "demo", id: "missing-1" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    expect(response.status).toBe(404);
  });
});
