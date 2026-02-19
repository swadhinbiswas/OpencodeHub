import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
    pullRequestReviewers: { pullRequestId: {}, isRequired: {} },
    pullRequestReviews: { pullRequestId: {}, submittedAt: {} },
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

import { GET as requiredReviewersGet } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/required-reviewers";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      pullRequests: {
        findFirst: vi.fn(async () => ({ id: "pr-1", number: 12 })),
      },
      pullRequestReviewers: {
        findMany: vi.fn(async () => ([
          { userId: "u1", user: { username: "alice", displayName: "Alice" } },
          { userId: "u2", user: { username: "bob", displayName: "Bob" } },
        ])),
      },
      pullRequestReviews: {
        findMany: vi.fn(async () => ([
          { reviewerId: "u1", state: "approved", submittedAt: new Date("2026-02-19T00:00:00Z"), createdAt: new Date("2026-02-19T00:00:00Z") },
          { reviewerId: "u2", state: "changes_requested", submittedAt: new Date("2026-02-18T00:00:00Z"), createdAt: new Date("2026-02-18T00:00:00Z") },
        ])),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("required reviewers route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canReadRepoMock.mockResolvedValue(true);
  });

  it("returns 401 for unauthenticated users", async () => {
    const response = await requiredReviewersGet({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: {},
    } as any);

    expect(response.status).toBe(401);
  });

  it("returns required reviewer approval status", async () => {
    const response = await requiredReviewersGet({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.totalRequired).toBe(2);
    expect(body?.data?.approvedRequired).toBe(1);
    expect(body?.data?.missingRequired).toBe(1);
    expect(body?.data?.reviewers?.[0]?.username).toBe("alice");
  });
});
