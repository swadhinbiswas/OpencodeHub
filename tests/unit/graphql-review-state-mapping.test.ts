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
  const insertCalls: any[] = [];
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

describe("GraphQL review state mapping", () => {
  beforeEach(() => {
    canWriteRepoMock.mockResolvedValue(true);
    checkPathPermissionsMock.mockResolvedValue({ allowed: true, deniedPaths: [] });
  });

  it("maps REQUEST_CHANGES event to changes_requested review state", async () => {
    const ctx = makeContext();

    await resolvers.Mutation.addPullRequestReview(
      {},
      {
        input: {
          pullRequestId: "pr-1",
          event: "REQUEST_CHANGES",
          body: "Needs updates",
          comments: [],
        },
      },
      ctx
    );

    const insertedReview = ctx.db.__state.insertCalls[0];
    expect(insertedReview.state).toBe("changes_requested");
  });
});
