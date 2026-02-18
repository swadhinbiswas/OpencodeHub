import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fakeSchema } = vi.hoisted(() => ({
  fakeSchema: {
    users: { username: {}, id: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
    aiReviews: { id: {}, pullRequestId: {} },
    aiReviewSuggestions: { aiReviewId: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

import { POST as callbackPost } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/ai-review/callback";

function makeDb() {
  const owner = { id: "owner-1" };
  const repository = { id: "repo-1" };
  const pr = { id: "pr-1" };
  const review = { id: "review-1", summary: "old", rawResponse: null };

  const insertCalls: unknown[] = [];
  const updateCalls: unknown[] = [];
  const deleteCalls: unknown[] = [];

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
      aiReviews: {
        findFirst: vi.fn(async () => review),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(async (value: unknown) => {
        insertCalls.push(value);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((value: unknown) => ({
        where: vi.fn(async () => {
          updateCalls.push(value);
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async (value: unknown) => {
        deleteCalls.push(value);
      }),
    })),
    __state: {
      insertCalls,
      updateCalls,
      deleteCalls,
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("AI review callback route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    vi.stubEnv("EXTERNAL_AGENT_CALLBACK_SECRET", "callback-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects unauthorized callback requests", async () => {
    const response = await callbackPost({
      params: { owner: "acme", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/acme/demo/pulls/42/ai-review/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewId: "review-1", status: "completed", suggestions: [] }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(401);
    expect(body?.error?.code).toBe("UNAUTHORIZED");
  });

  it("applies completed callback payload and stores suggestions", async () => {
    const response = await callbackPost({
      params: { owner: "acme", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/acme/demo/pulls/42/ai-review/callback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer callback-secret",
        },
        body: JSON.stringify({
          reviewId: "review-1",
          status: "completed",
          summary: "Looks good overall",
          overallSeverity: "warning",
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          suggestions: [
            {
              path: "src/index.ts",
              line: 10,
              severity: "warning",
              type: "bug",
              title: "Null check missing",
              message: "Add guard before dereference",
            },
          ],
        }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.data?.status).toBe("completed");
    expect(mockDb.__state.deleteCalls.length).toBe(1);
    expect(mockDb.__state.insertCalls.length).toBe(1);
    expect(mockDb.__state.updateCalls.length).toBe(1);
  });

  it("marks review as failed when callback reports failure", async () => {
    const response = await callbackPost({
      params: { owner: "acme", repo: "demo", number: "42" },
      request: new Request("http://localhost/api/repos/acme/demo/pulls/42/ai-review/callback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer callback-secret",
        },
        body: JSON.stringify({
          reviewId: "review-1",
          status: "failed",
          errorMessage: "Agent timeout",
        }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.status).toBe("failed");
    expect(mockDb.__state.insertCalls.length).toBe(0);
    expect(mockDb.__state.updateCalls.length).toBe(1);
  });
});
