import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  checkPathPermissionsMock,
  getFileContentMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  getFileContentMock: vi.fn(async () => null),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {}, diskPath: {}, defaultBranch: {} },
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

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

vi.mock("@/lib/git-storage", () => ({
  resolveRepoPath: vi.fn(async () => "/tmp/repo"),
}));

vi.mock("@/lib/git", () => ({
  getFileContent: getFileContentMock,
}));

import { GET as templatesGet } from "@/pages/api/repos/[owner]/[repo]/pulls/templates";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1", username: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({
          id: "repo-1",
          ownerId: "owner-1",
          name: "demo",
          diskPath: "/tmp/repo",
          defaultBranch: "main",
        })),
      },
    },
  };
}

describe("pull request template path permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
    getFileContentMock.mockResolvedValue({
      isBinary: false,
      content: "## PR Template",
    });
  });

  it("skips restricted template paths and returns readable template content", async () => {
    checkPathPermissionsMock.mockImplementation(async (_userId: string, _repoId: string, paths: string[]) => {
      if (paths[0] === ".github/pull_request_template.md") {
        return {
          allowed: false,
          deniedPaths: [".github/pull_request_template.md"],
          reason: "denied",
        };
      }
      return { allowed: true, deniedPaths: [] };
    });

    getFileContentMock.mockImplementation(async (_repoPath: string, path: string) => {
      if (path === ".github/PULL_REQUEST_TEMPLATE.md") {
        return { isBinary: false, content: "## Secondary Template" };
      }
      return null;
    });

    const response = await templatesGet({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/templates"),
    } as any);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body?.data?.content).toBe("## Secondary Template");
    expect(checkPathPermissionsMock).toHaveBeenCalledWith(
      "user-1",
      "repo-1",
      [".github/pull_request_template.md"],
      "read"
    );
  });
});
