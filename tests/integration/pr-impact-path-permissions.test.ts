import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canWriteRepoMock,
  checkPathPermissionsMock,
  compareBranchesMock,
  analyzeImpactMock,
  detectBreakingChangesMock,
  detectMigrationsMock,
  detectIaCFilesMock,
  triggerIaCHooksMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  compareBranchesMock: vi.fn(async () => ({ diffs: [{ file: "src/app.ts" }] })),
  analyzeImpactMock: vi.fn(async () => ({ breakingChanges: [], migrations: [] })),
  detectBreakingChangesMock: vi.fn(async () => []),
  detectMigrationsMock: vi.fn(async () => []),
  detectIaCFilesMock: vi.fn(() => []),
  triggerIaCHooksMock: vi.fn(async () => []),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
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

vi.mock("@/lib/git-storage", () => ({
  resolveRepoPath: vi.fn(async () => "/tmp/repo"),
}));

vi.mock("@/lib/git", () => ({
  compareBranches: compareBranchesMock,
}));

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

vi.mock("@/lib/dependency-awareness", () => ({
  analyzeImpact: analyzeImpactMock,
  detectBreakingChanges: detectBreakingChangesMock,
  detectMigrations: detectMigrationsMock,
}));

vi.mock("@/lib/iac-hooks", () => ({
  detectIaCFiles: detectIaCFilesMock,
  triggerIaCHooks: triggerIaCHooksMock,
}));

import { GET as impactGet, POST as impactPost } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/impact";

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
    },
  };
}

describe("PR impact path permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    canWriteRepoMock.mockResolvedValue(true);
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
    compareBranchesMock.mockResolvedValue({ diffs: [{ file: "src/app.ts" }] });
  });

  it("filters hidden file paths from GET impact payload", async () => {
    analyzeImpactMock.mockResolvedValue({
      breakingChanges: [
        { id: "bc-1", affectedFiles: ["src/app.ts", "secure/secret.ts"] },
      ],
      migrations: [
        { id: "mg-1", files: ["db/migrations/001.sql", "secure/secret.sql"] },
      ],
      affectedRepos: [],
      riskScore: 25,
    });
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/secret.ts", "secure/secret.sql"],
      reason: "Insufficient permissions for paths: secure/secret.ts, secure/secret.sql",
    });

    const response = await impactGet({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body?.data?.breakingChanges?.[0]?.affectedFiles).toEqual(["src/app.ts"]);
    expect(body?.data?.migrations?.[0]?.files).toEqual(["db/migrations/001.sql"]);
    expect(body?.data?.hiddenPathArtifacts).toBe(2);
    expect(checkPathPermissionsMock).toHaveBeenCalledWith(
      "user-1",
      "repo-1",
      ["src/app.ts", "secure/secret.ts", "db/migrations/001.sql", "secure/secret.sql"],
      "read"
    );
  });

  it("blocks impact scan when changed files are not path-authorized", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["src/secret.ts"],
      reason: "Insufficient permissions for paths: src/secret.ts",
    });
    compareBranchesMock.mockResolvedValue({ diffs: [{ file: "src/secret.ts" }] });

    const response = await impactPost({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/impact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(detectBreakingChangesMock).not.toHaveBeenCalled();
  });

  it("runs impact scan when path permissions pass", async () => {
    const response = await impactPost({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/impact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    expect(response.status).toBe(200);
    expect(checkPathPermissionsMock).toHaveBeenCalledWith("user-1", "repo-1", ["src/app.ts"], "write");
    expect(detectBreakingChangesMock).toHaveBeenCalledWith("pr-1");
  });
});
