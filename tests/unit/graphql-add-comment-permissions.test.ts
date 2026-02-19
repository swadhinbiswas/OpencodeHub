import { beforeEach, describe, expect, it, vi } from "vitest";

const { canWriteRepoMock } = vi.hoisted(() => ({
  canWriteRepoMock: vi.fn(async () => true),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual<any>("@/lib/permissions");
  return {
    ...actual,
    canWriteRepo: canWriteRepoMock,
  };
});

import { resolvers } from "@/lib/graphql/resolvers";

function makeContext() {
  const insertCalls: unknown[] = [];
  return {
    db: {
      query: {
        issues: {
          findFirst: vi.fn(async () => null),
        },
        pullRequests: {
          findFirst: vi.fn(async () => ({ id: "pr-1", repositoryId: "repo-1" })),
        },
        repositories: {
          findFirst: vi.fn(async () => ({ id: "repo-1" })),
        },
        pullRequestComments: {
          findFirst: vi.fn(async () => ({ id: "comment-1" })),
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

describe("GraphQL addComment permission enforcement", () => {
  beforeEach(() => {
    canWriteRepoMock.mockResolvedValue(true);
  });

  it("blocks PR comment creation when user lacks repository write permission", async () => {
    const ctx = makeContext();
    canWriteRepoMock.mockResolvedValue(false);

    await expect(
      resolvers.Mutation.addComment(
        {},
        { input: { subjectId: "pr-1", body: "test comment" } },
        ctx
      )
    ).rejects.toThrow("Insufficient repository permissions");

    expect(ctx.db.__state.insertCalls).toHaveLength(0);
  });
});
