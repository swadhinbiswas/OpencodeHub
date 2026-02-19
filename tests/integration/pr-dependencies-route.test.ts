import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  getDependencyGraphMock,
  detectBranchDependenciesMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  getDependencyGraphMock: vi.fn(async () => ({
    nodes: [{ prId: "pr-2", prNumber: 2, title: "Feature", dependsOn: ["pr-1"], blockedBy: [], dependencyType: "branch" }],
    edges: [{ from: "pr-2", to: "pr-1", type: "branch" }],
  })),
  detectBranchDependenciesMock: vi.fn(async () => ({
    nodes: [{ prId: "pr-2", prNumber: 2, title: "Feature", dependsOn: ["pr-1"], blockedBy: [], dependencyType: "branch" }],
    edges: [{ from: "pr-2", to: "pr-1", type: "branch" }],
  })),
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

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
}));

vi.mock("@/lib/pr-dependencies", () => ({
  getDependencyGraph: getDependencyGraphMock,
  detectBranchDependencies: detectBranchDependenciesMock,
}));

import { GET as dependencyGraphGet } from "@/pages/api/repos/[owner]/[repo]/pulls/dependencies";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("PR dependency graph route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    getDependencyGraphMock.mockClear();
    detectBranchDependenciesMock.mockClear();
  });

  it("returns full dependency graph by default", async () => {
    const response = await dependencyGraphGet({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/dependencies"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.includeFiles).toBe(true);
    expect(getDependencyGraphMock).toHaveBeenCalledWith("repo-1");
    expect(detectBranchDependenciesMock).not.toHaveBeenCalled();
  });

  it("supports branch-only dependency mode", async () => {
    const response = await dependencyGraphGet({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/dependencies?includeFiles=false"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.includeFiles).toBe(false);
    expect(detectBranchDependenciesMock).toHaveBeenCalledWith("repo-1");
  });
});

