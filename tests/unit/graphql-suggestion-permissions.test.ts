import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canApplySuggestionsMock,
  applySuggestionMock,
  batchApplySuggestionsMock,
  checkPathPermissionsMock,
} = vi.hoisted(() => ({
  canApplySuggestionsMock: vi.fn(async () => true),
  applySuggestionMock: vi.fn(async () => ({ success: true })),
  batchApplySuggestionsMock: vi.fn(async () => ({ applied: [], failed: [] })),
  checkPathPermissionsMock: vi.fn(async () => ({ allowed: true, deniedPaths: [] })),
}));

vi.mock("@/lib/suggestions", () => ({
  canApplySuggestions: canApplySuggestionsMock,
  applySuggestion: applySuggestionMock,
  batchApplySuggestions: batchApplySuggestionsMock,
}));

vi.mock("@/lib/path-scoping", () => ({
  checkPathPermissions: checkPathPermissionsMock,
}));

import { resolvers } from "@/lib/graphql/resolvers";

function makeContext() {
  const comment = {
    id: "comment-1",
    path: "secure/config.yml",
    pullRequest: { id: "pr-1", repositoryId: "repo-1" },
  };

  return {
    db: {
      query: {
        pullRequestComments: {
          findFirst: vi.fn(async () => comment),
          findMany: vi.fn(async (_args?: any) => [comment]),
        },
      },
    },
    userId: "user-1",
  } as any;
}

describe("GraphQL suggestion permission enforcement", () => {
  beforeEach(() => {
    canApplySuggestionsMock.mockResolvedValue(true);
    applySuggestionMock.mockResolvedValue({ success: true });
    batchApplySuggestionsMock.mockResolvedValue({ applied: ["comment-1"], failed: [] });
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
  });

  it("blocks applySuggestion when path permission is denied", async () => {
    const ctx = makeContext();
    checkPathPermissionsMock.mockResolvedValue({
      allowed: false,
      deniedPaths: ["secure/config.yml"],
      reason: "Insufficient permissions for paths: secure/config.yml",
    });

    await expect(
      resolvers.Mutation.applySuggestion(
        {},
        { input: { commentId: "comment-1" } },
        ctx
      )
    ).rejects.toThrow("Insufficient permissions for paths: secure/config.yml");

    expect(applySuggestionMock).not.toHaveBeenCalled();
  });

  it("blocks batchApplySuggestions when comments span multiple PRs", async () => {
    const ctx = makeContext();
    ctx.db.query.pullRequestComments.findMany.mockResolvedValueOnce([
      { id: "comment-1", path: "a.ts", pullRequest: { id: "pr-1", repositoryId: "repo-1" } },
      { id: "comment-2", path: "b.ts", pullRequest: { id: "pr-2", repositoryId: "repo-1" } },
    ]);

    await expect(
      resolvers.Mutation.batchApplySuggestions(
        {},
        { input: { commentIds: ["comment-1", "comment-2"] } },
        ctx
      )
    ).rejects.toThrow("All suggestions in a batch must belong to the same pull request");

    expect(batchApplySuggestionsMock).not.toHaveBeenCalled();
  });
});
