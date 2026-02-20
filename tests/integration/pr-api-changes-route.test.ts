import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canWriteRepoMock,
  compareBranchesMock,
  detectAPIChangesForPullRequestMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  compareBranchesMock: vi.fn(async () => ({ diffs: [{ file: "openapi.yaml" }] })),
  detectAPIChangesForPullRequestMock: vi.fn(async () => [
    {
      type: "removed",
      path: "/v1/users",
      method: "GET",
      breaking: true,
      details: "Endpoint removed",
      sourceFile: "openapi.yaml",
    },
  ]),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
    apiChangeDetections: { pullRequestId: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
  canWriteRepo: canWriteRepoMock,
}));

vi.mock("@/lib/git", () => ({
  compareBranches: compareBranchesMock,
}));

vi.mock("@/lib/git-storage", () => ({
  resolveRepoPath: vi.fn(async () => "/tmp/repo"),
}));

vi.mock("@/lib/dependency-awareness", () => ({
  detectAPIChangesForPullRequest: detectAPIChangesForPullRequestMock,
}));

import { GET as apiChangesGet, POST as apiChangesPost } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/api-changes";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo", diskPath: "/tmp/repo" })),
      },
      pullRequests: {
        findFirst: vi.fn(async () => ({
          id: "pr-1",
          repositoryId: "repo-1",
          number: 42,
          baseBranch: "main",
          headBranch: "feature",
        })),
      },
      apiChangeDetections: {
        findMany: vi.fn(async () => ([
          {
            id: "api-1",
            pullRequestId: "pr-1",
            changeType: "removed",
            path: "/v1/users",
            method: "GET",
            breaking: true,
            details: "Endpoint removed",
            affectedFiles: ["openapi.yaml"],
          },
        ])),
      },
    },
  };
}

async function json(response: Response): Promise<any> {
  return response.json();
}

describe("PR API changes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns persisted API change detections", async () => {
    const response = await apiChangesGet({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await json(response);
    expect(response.status).toBe(200);
    expect(body?.data?.total).toBe(1);
    expect(body?.data?.breaking).toBe(1);
    expect(body?.data?.changes?.[0]?.path).toBe("/v1/users");
  });

  it("runs API change scan for PR", async () => {
    const response = await apiChangesPost({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await json(response);
    expect(response.status).toBe(200);
    expect(body?.data?.total).toBe(1);
    expect(body?.data?.breaking).toBe(1);
    expect(detectAPIChangesForPullRequestMock).toHaveBeenCalledWith("pr-1", ["openapi.yaml"]);
  });
});
