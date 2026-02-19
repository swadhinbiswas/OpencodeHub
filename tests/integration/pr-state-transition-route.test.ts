import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  patchPullRequestMock,
  fakeSchema,
} = vi.hoisted(() => ({
  patchPullRequestMock: vi.fn(async () =>
    new Response(JSON.stringify({ success: true, data: { success: true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  ),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    prStateDefinitions: { id: {}, repositoryId: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/pages/api/repos/[owner]/[repo]/pulls/[number]/index", () => ({
  PATCH: patchPullRequestMock,
}));

import { POST as transitionPost } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/state";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1" })),
      },
      prStateDefinitions: {
        findFirst: vi.fn(async () => ({ name: "in_review" })),
      },
    },
  };
}

describe("PR state transition route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    patchPullRequestMock.mockClear();
  });

  it("rejects requests with neither state nor stateId", async () => {
    const response = await transitionPost({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/12/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    expect(response.status).toBe(400);
    expect(patchPullRequestMock).not.toHaveBeenCalled();
  });

  it("maps stateId to state name and delegates transition", async () => {
    await transitionPost({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/12/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stateId: "state-1" }),
      }),
    } as any);

    expect(patchPullRequestMock).toHaveBeenCalledTimes(1);
    const args = patchPullRequestMock.mock.calls[0][0];
    const forwardedBody = await args.request.json();
    expect(forwardedBody.state).toBe("in_review");
  });

  it("passes explicit state through to patch handler", async () => {
    await transitionPost({
      params: { owner: "owner-1", repo: "demo", number: "12" },
      locals: { user: { id: "user-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/12/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "closed" }),
      }),
    } as any);

    const args = patchPullRequestMock.mock.calls[0][0];
    const forwardedBody = await args.request.json();
    expect(forwardedBody.state).toBe("closed");
  });
});
