import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canAdminRepoMock,
  addRequiredCheckMock,
  createMergeGateMock,
  getMergeGatesMock,
  evaluateGatesMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canAdminRepoMock: vi.fn(async () => true),
  addRequiredCheckMock: vi.fn(async () => ({ id: "check-1", checkName: "ci/build", branch: "main" })),
  createMergeGateMock: vi.fn(async () => ({ id: "gate-1", name: "PR Label Gate", gateType: "label" })),
  getMergeGatesMock: vi.fn(async () => [{ id: "gate-1", name: "PR Label Gate", gateType: "label" }]),
  evaluateGatesMock: vi.fn(async () => ({ canMerge: true, results: [] })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    requiredStatusChecks: { repositoryId: {} },
    pullRequests: { repositoryId: {}, number: {} },
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

vi.mock("@/lib/ci-gates", () => ({
  addRequiredCheck: addRequiredCheckMock,
  createMergeGate: createMergeGateMock,
  getMergeGates: getMergeGatesMock,
  evaluateGates: evaluateGatesMock,
}));

import { GET as mergeGatesGet, POST as mergeGatesPost } from "@/pages/api/repos/[owner]/[repo]/merge-gates";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      requiredStatusChecks: {
        findMany: vi.fn(async () => [{ id: "check-1", checkName: "ci/build", branch: "main" }]),
      },
      pullRequests: {
        findFirst: vi.fn(async () => ({ id: "pr-1", number: 12 })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("merge gates route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    canAdminRepoMock.mockResolvedValue(true);
    addRequiredCheckMock.mockResolvedValue({ id: "check-1", checkName: "ci/build", branch: "main" });
    createMergeGateMock.mockResolvedValue({ id: "gate-1", name: "PR Label Gate", gateType: "label" });
    getMergeGatesMock.mockResolvedValue([{ id: "gate-1", name: "PR Label Gate", gateType: "label" }]);
    evaluateGatesMock.mockResolvedValue({ canMerge: true, results: [] });
  });

  it("returns merge gate policy configuration for readers", async () => {
    getMergeGatesMock.mockResolvedValue([
      { id: "gate-1", name: "PR Label Gate", gateType: "custom", conditionScript: null },
    ] as any);
    mockDb.query.requiredStatusChecks.findMany = vi.fn(async () => [
      { id: "check-1", checkName: "ci/build", branch: "main" },
      { id: "check-2", checkName: "ci/build", branch: "main" },
    ]);

    const response = await mergeGatesGet({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/merge-gates"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.requiredChecks).toHaveLength(2);
    expect(body?.data?.mergeGates).toHaveLength(1);
    expect(body?.data?.report?.requiredChecksTotal).toBe(2);
    expect(body?.data?.report?.mergeGatesTotal).toBe(1);
    expect(body?.data?.report?.warnings).toHaveLength(2);
    expect(body?.data?.report?.warnings?.[0]?.code).toBe("duplicate_required_checks");
  });

  it("returns 401 for unauthenticated reads", async () => {
    const response = await mergeGatesGet({
      params: { owner: "owner-1", repo: "demo" },
      locals: {},
      request: new Request("http://localhost/api/repos/owner-1/demo/merge-gates"),
    } as any);

    expect(response.status).toBe(401);
  });

  it("returns readiness report when pullNumber is provided", async () => {
    const response = await mergeGatesGet({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/merge-gates?pullNumber=12"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(evaluateGatesMock).toHaveBeenCalledWith("pr-1");
    expect(body?.data?.readiness?.canMerge).toBe(true);
  });

  it("validates pullNumber query parameter", async () => {
    const response = await mergeGatesGet({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/merge-gates?pullNumber=abc"),
    } as any);

    expect(response.status).toBe(400);
  });

  it("creates required check for admins", async () => {
    const response = await mergeGatesPost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/merge-gates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "required_check",
          branch: "main",
          checkName: "ci/build",
        }),
      }),
    } as any);

    expect(response.status).toBe(200);
    expect(addRequiredCheckMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      branch: "main",
      checkName: "ci/build",
      strictMode: undefined,
    });
  });

  it("creates merge gate for admins", async () => {
    const response = await mergeGatesPost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/merge-gates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "merge_gate",
          name: "PR Label Gate",
          gateType: "label",
          config: { required: "ready-to-merge" },
        }),
      }),
    } as any);

    expect(response.status).toBe(200);
    expect(createMergeGateMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      name: "PR Label Gate",
      description: undefined,
      gateType: "label",
      config: { required: "ready-to-merge" },
      conditionScript: undefined,
    });
  });

  it("returns 403 when non-admin attempts write", async () => {
    canAdminRepoMock.mockResolvedValue(false);
    const response = await mergeGatesPost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/merge-gates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "required_check",
          branch: "main",
          checkName: "ci/build",
        }),
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(addRequiredCheckMock).not.toHaveBeenCalled();
    expect(createMergeGateMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid payload", async () => {
    const response = await mergeGatesPost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/merge-gates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "merge_gate",
          gateType: "label",
        }),
      }),
    } as any);

    expect(response.status).toBe(400);
    expect(createMergeGateMock).not.toHaveBeenCalled();
  });
});
