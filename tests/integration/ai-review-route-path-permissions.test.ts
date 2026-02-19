import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  checkPathPermissionsMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
  fakeSchema: {
    users: { username: {}, id: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
    aiReviews: { pullRequestId: {}, createdAt: {} },
    aiReviewSuggestions: { aiReviewId: {}, path: {} },
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

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: vi.fn(async () => ({ userId: "user-1", isAdmin: false })),
}));

vi.mock("@/lib/ai-review", () => ({
  triggerAIReview: vi.fn(async () => ({ id: "review-1", status: "pending" })),
}));

vi.mock("@/lib/ai-config", () => ({
  parseAIConfigFromStorage: vi.fn(() => ({ provider: "openai", model: "gpt-4-turbo", apiKeys: {} })),
}));

import { GET as aiReviewGet } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/ai-review";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo", owner: { username: "owner-1" } })),
      },
      pullRequests: {
        findFirst: vi.fn(async () => ({ id: "pr-1", repositoryId: "repo-1", number: 42 })),
      },
      aiReviews: {
        findFirst: vi.fn(async () => ({ id: "review-1", pullRequestId: "pr-1" })),
      },
      aiReviewSuggestions: {
        findMany: vi.fn(async () => ([
          { id: "s1", aiReviewId: "review-1", path: "src/app.ts", message: "ok" },
          { id: "s2", aiReviewId: "review-1", path: "secure/secret.ts", message: "sensitive" },
        ])),
      },
    },
  };
}

describe("AI review route path permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
  });

  it("filters suggestion paths denied by read permissions", async () => {
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/secret.ts"],
      reason: "denied",
    });

    const response = await aiReviewGet({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body?.data?.suggestions).toHaveLength(1);
    expect(body?.data?.suggestions?.[0]?.path).toBe("src/app.ts");
    expect(body?.data?.hiddenSuggestions).toBe(1);
    expect(checkPathPermissionsMock).toHaveBeenCalledWith(
      "user-1",
      "repo-1",
      ["src/app.ts", "secure/secret.ts"],
      "read"
    );
  });
});
