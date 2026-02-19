import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canWriteRepoMock,
  requestStackApprovalMock,
  getStackApprovalStatusMock,
  canMergeStackMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  requestStackApprovalMock: vi.fn(async () => true),
  getStackApprovalStatusMock: vi.fn(async () => null),
  canMergeStackMock: vi.fn(async () => ({ canMerge: false, blockers: [] })),
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
  getStackApprovalStatus: getStackApprovalStatusMock,
  canMergeStack: canMergeStackMock,
  requestStackApproval: requestStackApprovalMock,
}));

import { GET as stackApprovalsGet, POST as requestApprovalsPost } from "@/pages/api/repos/[owner]/[repo]/stacks/[stackId]/approvals";

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
    vi.clearAllMocks();
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

  it("returns stack approval status with readiness blockers", async () => {
    getStackApprovalStatusMock.mockResolvedValue({
      stackId: "stack-1",
      allApproved: false,
      summary: {
        totalPrs: 2,
        approvedPrs: 1,
        pendingPrs: 1,
        totalMissingApprovals: 1,
        totalMissingRequiredReviewerApprovals: 1,
      },
      prs: [],
    });
    canMergeStackMock.mockResolvedValue({
      canMerge: false,
      blockers: ["PR #12: Needs 1 more approval(s)"],
    });

    const response = await stackApprovalsGet({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "actor-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.canMerge).toBe(false);
    expect(body?.data?.blockers).toHaveLength(1);
    expect(body?.data?.recommendedReviewers).toEqual([]);
    expect(body?.data?.nextActions?.shouldRequestApprovals).toBe(true);
    expect(body?.data?.status?.summary?.pendingPrs).toBe(1);
    expect(body?.data?.status?.summary?.totalMissingRequiredReviewerApprovals).toBe(1);
  });

  it("returns deduplicated recommended reviewers from missing required approvals", async () => {
    getStackApprovalStatusMock.mockResolvedValue({
      stackId: "stack-1",
      allApproved: false,
      summary: {
        totalPrs: 2,
        approvedPrs: 0,
        pendingPrs: 2,
        totalMissingApprovals: 2,
        totalMissingRequiredReviewerApprovals: 2,
      },
      prs: [
        {
          prId: "pr-1",
          prNumber: 11,
          title: "PR 1",
          isApproved: false,
          approvalCount: 0,
          requiredApprovals: 1,
          missingApprovals: 1,
          changesRequested: false,
          requestedReviewers: [],
          missingRequiredReviewers: [
            { userId: "u-1", username: "alice" },
            { userId: "u-2", username: "bob" },
          ],
        },
        {
          prId: "pr-2",
          prNumber: 12,
          title: "PR 2",
          isApproved: false,
          approvalCount: 0,
          requiredApprovals: 1,
          missingApprovals: 1,
          changesRequested: false,
          requestedReviewers: [],
          missingRequiredReviewers: [
            { userId: "u-1", username: "alice" },
          ],
        },
      ],
    });
    canMergeStackMock.mockResolvedValue({
      canMerge: false,
      blockers: ["PR #11: Missing required reviewer approval(s) from alice, bob"],
    });

    const response = await stackApprovalsGet({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "actor-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.recommendedReviewers).toEqual(["alice", "bob"]);
    expect(body?.data?.nextActions?.pendingPrs).toBe(2);
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

  it("supports dry-run mode with richer eligibility details", async () => {
    canReadRepoMock.mockImplementation(async (userId: string) => userId === "reviewer-1");

    const response = await requestApprovalsPost({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "actor-1" } },
      request: new Request("http://localhost/api/repos/owner-1/demo/stacks/stack-1/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewers: ["alice", "alice", "charlie"], dryRun: true }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(requestStackApprovalMock).not.toHaveBeenCalled();
    expect(body?.data?.dryRun).toBe(true);
    expect(body?.data?.requested).toEqual(["alice"]);
    expect(body?.data?.notFound).toEqual(["charlie"]);
    expect(body?.data?.requestedDuplicates).toBe(1);
  });
});
