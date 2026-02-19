import { beforeEach, describe, expect, it, vi } from "vitest";

const { canWriteRepoMock, checkPathPermissionsMock } = vi.hoisted(() => ({
  canWriteRepoMock: vi.fn(async () => true),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual<any>("@/lib/permissions");
  return {
    ...actual,
    canWriteRepo: canWriteRepoMock,
  };
});

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

import { resolvers } from "@/lib/graphql/resolvers";

function makeContext() {
  const insertCalls: unknown[] = [];
  return {
    db: {
      query: {
        pullRequests: {
          findFirst: vi.fn(async () => ({ id: "pr-1", repositoryId: "repo-1" })),
        },
        repositories: {
          findFirst: vi.fn(async () => ({ id: "repo-1" })),
        },
        pullRequestReviews: {
          findFirst: vi.fn(async () => ({ id: "review-1" })),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn(async (value: unknown) => {
          insertCalls.push(value);
        }),
      })),
      __state: { insertCalls },
    },
    userId: "user-1",
    user: { isAdmin: false },
  } as any;
}

describe("GraphQL addPullRequestReview permission enforcement", () => {
  beforeEach(() => {
    canWriteRepoMock.mockResolvedValue(true);
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
  });

  it("blocks review submission when path write permission is denied", async () => {
    const ctx = makeContext();
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/config.yml"],
      reason: "Insufficient permissions for paths: secure/config.yml",
    });

    await expect(
      resolvers.Mutation.addPullRequestReview(
        {},
        {
          input: {
            pullRequestId: "pr-1",
            event: "COMMENT",
            body: "review",
            comments: [{ body: "inline", path: "secure/config.yml", line: 3 }],
          },
        },
        ctx
      )
    ).rejects.toThrow("Insufficient permissions for paths: secure/config.yml");

    expect(ctx.db.__state.insertCalls).toHaveLength(0);
  });
});
