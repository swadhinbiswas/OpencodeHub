import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserFromRequestMock,
  canApplySuggestionsMock,
  applySuggestionMock,
  batchApplySuggestionsMock,
  checkPathPermissionsMock,
  fakeSchema,
} = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(async () => ({ userId: "user-1" })),
  canApplySuggestionsMock: vi.fn(async () => true),
  applySuggestionMock: vi.fn(async () => ({ success: true, commitSha: "abc123" })),
  batchApplySuggestionsMock: vi.fn(async () => ({ success: true, applied: [], failed: [] })),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  fakeSchema: {
    users: { username: {}, id: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
    pullRequestComments: { pullRequestId: {}, id: {} },
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

vi.mock("@/lib/suggestions", () => ({
  canApplySuggestions: canApplySuggestionsMock,
  applySuggestion: applySuggestionMock,
  batchApplySuggestions: batchApplySuggestionsMock,
}));

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

import { POST as applySuggestionsPost } from "@/pages/api/repos/[owner]/[repo]/pulls/[pullNumber]/suggestions/apply";

function makeDb() {
  const owner = { id: "owner-1" };
  const repository = { id: "repo-1" };
  const pr = { id: "pr-1" };
  const comments = [
    { id: "comment-1", path: "secure/config.yml" },
    { id: "comment-2", path: "src/app.ts" },
  ];

  return {
    query: {
      users: {
        findFirst: vi.fn(async () => owner),
      },
      repositories: {
        findFirst: vi.fn(async () => repository),
      },
      pullRequests: {
        findFirst: vi.fn(async () => pr),
      },
      pullRequestComments: {
        findMany: vi.fn(async () => comments),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("suggestions apply route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    getUserFromRequestMock.mockResolvedValue({ userId: "user-1" });
    canApplySuggestionsMock.mockResolvedValue(true);
    applySuggestionMock.mockResolvedValue({ success: true, commitSha: "abc123" });
    batchApplySuggestionsMock.mockResolvedValue({ success: true, applied: ["comment-1"], failed: [] });
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
  });

  it("blocks apply when path-scoped write permission is denied", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/config.yml"],
      reason: "Insufficient permissions for paths: secure/config.yml",
    });

    const response = await applySuggestionsPost({
      params: { owner: "owner-1", repo: "demo", pullNumber: "42" },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/suggestions/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commentIds: ["comment-1"] }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
    expect(applySuggestionMock).not.toHaveBeenCalled();
  });

  it("applies suggestion when permission checks pass", async () => {
    const response = await applySuggestionsPost({
      params: { owner: "owner-1", repo: "demo", pullNumber: "42" },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42/suggestions/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commentIds: ["comment-1"] }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.success).toBe(true);
    expect(checkPathPermissionsMock).toHaveBeenCalledWith(
      "user-1",
      "repo-1",
      ["secure/config.yml"],
      "write"
    );
    expect(applySuggestionMock).toHaveBeenCalledWith("comment-1", "user-1");
  });
});
