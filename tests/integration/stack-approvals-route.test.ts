import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canWriteRepoMock,
  requestStackApprovalMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  requestStackApprovalMock: vi.fn(async () => true),
  fakeSchema: {
    users: { username: {}, id: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    prStacks: { id: {}, repositoryId: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
  canWriteRepo: canWriteRepoMock,
}));

vi.mock("@/lib/stack-approvals", () => ({
  getStackApprovalStatus: vi.fn(async () => null),
  requestStackApproval: requestStackApprovalMock,
}));

import { POST as requestApprovalsPost } from "@/pages/api/repos/[owner]/[repo]/stacks/[stackId]/approvals";

function makeDb() {
  const owner = { id: "owner-1" };
  const repo = { id: "repo-1", ownerId: "owner-1", name: "demo" };
  const stack = { id: "stack-1", repositoryId: "repo-1" };
  const users = [
    { id: "reviewer-1", username: "alice" },
    { id: "reviewer-2", username: "bob" },
  ];

  return {
    query: {
      users: {
        findFirst: vi.fn(async (_args?: any) => owner),
        findMany: vi.fn(async () => users),
      },
      repositories: {
        findFirst: vi.fn(async () => repo),
      },
      prStacks: {
        findFirst: vi.fn(async () => stack),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("stack approvals route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canWriteRepoMock.mockResolvedValue(true);
    canReadRepoMock.mockResolvedValue(true);
    requestStackApprovalMock.mockResolvedValue(true);
  });

  it("validates request payload", async () => {
    const response = await requestApprovalsPost({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "actor-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/stacks/stack-1/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewers: [] }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body?.error?.code).toBe("BAD_REQUEST");
  });

  it("requests approvals only for reviewers with repository access", async () => {
    canReadRepoMock.mockImplementation(async (userId: string) => userId === "reviewer-1");

    const response = await requestApprovalsPost({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "actor-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/stacks/stack-1/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewers: ["alice", "bob"] }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(requestStackApprovalMock).toHaveBeenCalledWith("stack-1", ["reviewer-1"]);
    expect(body?.data?.requested).toEqual(["alice"]);
    expect(body?.data?.skipped).toEqual(["bob"]);
  });
});
