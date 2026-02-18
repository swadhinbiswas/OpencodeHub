import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canWriteRepoMock,
  autoLinkPRMock,
  triggerAutomationMock,
  checkCodeOwnerApprovalsForPRMock,
  canMergeMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canWriteRepoMock: vi.fn(async () => true),
  autoLinkPRMock: vi.fn(async () => {}),
  triggerAutomationMock: vi.fn(async () => {}),
  checkCodeOwnerApprovalsForPRMock: vi.fn(async () => ({ ok: true })),
  canMergeMock: vi.fn(async () => ({ canMerge: true })),
  fakeSchema: {
    users: { username: {}, id: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
    prStateDefinitions: { repositoryId: {}, name: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  canWriteRepo: canWriteRepoMock,
  canReadRepo: vi.fn(async () => true),
}));

vi.mock("@/lib/pr-issue-linking", () => ({
  autoLinkPR: autoLinkPRMock,
}));

vi.mock("@/lib/automations", () => ({
  triggerAutomation: triggerAutomationMock,
}));

vi.mock("@/lib/pr-codeowner", () => ({
  checkCodeOwnerApprovalsForPR: checkCodeOwnerApprovalsForPRMock,
}));

vi.mock("@/lib/merge-queue", () => ({
  canMerge: canMergeMock,
}));

import { PATCH as patchPr } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/index";

function makeDb() {
  const owner = { id: "owner-1", username: "owner-1" };
  const repo = { id: "repo-1", ownerId: "owner-1", name: "demo" };
  const pr = {
    id: "pr-1",
    repositoryId: "repo-1",
    state: "open",
    stateId: "custom-state-1",
    isMerged: false,
  };

  const updateCalls: unknown[] = [];

  return {
    query: {
      users: {
        findFirst: vi.fn(async () => owner),
      },
      repositories: {
        findFirst: vi.fn(async () => repo),
      },
      pullRequests: {
        findFirst: vi.fn(async () => pr),
      },
      prStateDefinitions: {
        findFirst: vi.fn(async () => null),
      },
      prStateReviewers: {
        findMany: vi.fn(async () => []),
      },
      pullRequestReviews: {
        findMany: vi.fn(async () => []),
      },
      teams: {
        findFirst: vi.fn(async () => null),
      },
      teamMembers: {
        findMany: vi.fn(async () => []),
      },
      users2: {
        findFirst: vi.fn(async () => null),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn((value: unknown) => ({
        where: vi.fn(async () => {
          updateCalls.push(value);
        }),
      })),
    })),
    __state: {
      updateCalls,
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("PR update state route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canWriteRepoMock.mockResolvedValue(true);
    triggerAutomationMock.mockResolvedValue(undefined);
  });

  it("rejects unknown state values", async () => {
    const response = await patchPr({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "actor-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "ready_to_ship" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body?.error?.code).toBe("BAD_REQUEST");
  });

  it("clears custom state reference when closing PR", async () => {
    const response = await patchPr({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "actor-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "closed" }),
      }),
    } as any);

    expect(response.status).toBe(200);
    const updateData = mockDb.__state.updateCalls[0] as Record<string, unknown>;
    expect(updateData.state).toBe("closed");
    expect(updateData.stateId).toBeNull();
    expect(updateData.closedById).toBe("actor-1");
  });

  it("clears custom state reference when reopening PR", async () => {
    mockDb.query.pullRequests.findFirst.mockResolvedValueOnce({
      id: "pr-1",
      repositoryId: "repo-1",
      state: "closed",
      stateId: "custom-state-1",
      isMerged: false,
    });

    const response = await patchPr({
      params: { owner: "owner-1", repo: "demo", number: "42" },
      locals: { user: { id: "actor-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/pulls/42", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "open" }),
      }),
    } as any);

    expect(response.status).toBe(200);
    const updateData = mockDb.__state.updateCalls[0] as Record<string, unknown>;
    expect(updateData.state).toBe("open");
    expect(updateData.stateId).toBeNull();
    expect(updateData.closedAt).toBeNull();
  });
});
