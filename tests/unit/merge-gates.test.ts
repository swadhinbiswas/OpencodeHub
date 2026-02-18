import { beforeEach, describe, expect, it, vi } from "vitest";

let mockDb: any;
const getDatabaseMock = vi.fn(() => mockDb);
const getStackForPrMock = vi.fn(async () => null);
const checkCodeOwnerApprovalsForPRMock = vi.fn(async () => ({ ok: true }));

const fakeSchema: any = {
  pullRequests: { id: {}, repositoryId: {} },
  workflowRuns: { pullRequestId: {}, headSha: {}, createdAt: {} },
  branchProtection: { repositoryId: {}, active: {} },
  reviewRequirements: { repositoryId: {} },
  pullRequestReviews: { pullRequestId: {}, submittedAt: {}, state: {} },
  pullRequestReviewers: { pullRequestId: {}, isRequired: {} },
  requiredStatusChecks: { repositoryId: {}, isRequired: {} },
  externalCIConfigs: { repositoryId: {}, isEnabled: {}, syncStatus: {}, id: {} },
  externalBuilds: { pullRequestId: {}, configId: {}, createdAt: {} },
};

vi.mock("@/db", () => ({
  getDatabase: getDatabaseMock,
  schema: fakeSchema,
}));

vi.mock("@/lib/stacks", () => ({
  getStackForPr: getStackForPrMock,
  getStack: vi.fn(),
}));

vi.mock("@/lib/pr-codeowner", () => ({
  checkCodeOwnerApprovalsForPR: checkCodeOwnerApprovalsForPRMock,
}));

const { canMerge } = await import("@/lib/merge-queue");

function makeDb(overrides: Partial<Record<string, unknown>> = {}) {
  const pr = (overrides.pr as any) || {
    id: "pr1",
    repositoryId: "repo1",
    state: "open",
    isMerged: false,
    headSha: "sha1",
    baseBranch: "main",
    authorId: "author1",
  };

  const reviewRequirements = (overrides.reviewRequirements as any) || {
    minApprovals: 1,
    requireCodeOwner: false,
    requireReReviewOnPush: false,
    dismissStaleReviews: false,
  };

  return {
    query: {
      pullRequests: {
        findFirst: vi.fn(async () => pr),
      },
      workflowRuns: {
        findMany: vi.fn(async () => (overrides.workflowRuns as any[]) || []),
      },
      branchProtection: {
        findMany: vi.fn(async () => (overrides.branchProtection as any[]) || []),
      },
      reviewRequirements: {
        findFirst: vi.fn(async () => reviewRequirements),
      },
      pullRequestReviews: {
        findMany: vi.fn(async () => (overrides.reviews as any[]) || []),
      },
      pullRequestReviewers: {
        findMany: vi.fn(async () => (overrides.requiredReviewers as any[]) || []),
      },
      requiredStatusChecks: {
        findMany: vi.fn(async () => (overrides.requiredStatusChecks as any[]) || []),
      },
      externalCIConfigs: {
        findMany: vi.fn(async () => (overrides.externalCiConfigs as any[]) || []),
      },
      externalBuilds: {
        findMany: vi.fn(async () => (overrides.externalBuilds as any[]) || []),
      },
    },
  };
}

describe("merge gate enforcement", () => {
  beforeEach(() => {
    getStackForPrMock.mockResolvedValue(null);
    checkCodeOwnerApprovalsForPRMock.mockResolvedValue({ ok: true });
  });

  it("blocks when required status check is missing", async () => {
    mockDb = makeDb({
      reviews: [{ reviewerId: "u1", state: "approved", submittedAt: new Date() }],
      requiredStatusChecks: [{ checkName: "build", branch: "main", isRequired: true }],
      workflowRuns: [{ name: "test", status: "success", conclusion: "success", createdAt: new Date() }],
    });

    const result = await canMerge("pr1");
    expect(result.canMerge).toBe(false);
    expect(result.reason).toContain('Required status check "build"');
  });

  it("blocks when external CI is still running", async () => {
    mockDb = makeDb({
      reviews: [{ reviewerId: "u1", state: "approved", submittedAt: new Date() }],
      externalCiConfigs: [{ id: "cfg1", name: "Jenkins", isEnabled: true, syncStatus: true }],
      externalBuilds: [{ configId: "cfg1", status: "running", createdAt: new Date() }],
    });

    const result = await canMerge("pr1");
    expect(result.canMerge).toBe(false);
    expect(result.reason).toContain('External CI "Jenkins" is still running');
  });

  it("blocks when latest review from reviewer is changes_requested", async () => {
    mockDb = makeDb({
      reviewRequirements: {
        minApprovals: 0,
        requireCodeOwner: false,
        requireReReviewOnPush: false,
        dismissStaleReviews: false,
      },
      reviews: [
        { reviewerId: "u1", state: "changes_requested", submittedAt: new Date("2026-02-18T10:00:00Z") },
        { reviewerId: "u1", state: "approved", submittedAt: new Date("2026-02-18T09:00:00Z") },
      ],
    });

    const result = await canMerge("pr1");
    expect(result.canMerge).toBe(false);
    expect(result.reason).toContain("Changes requested");
  });

  it("blocks when codeowner approvals are required but missing", async () => {
    checkCodeOwnerApprovalsForPRMock.mockResolvedValue({
      ok: false,
      reason: "Code owner approval required",
    });

    mockDb = makeDb({
      reviewRequirements: {
        minApprovals: 1,
        requireCodeOwner: true,
        requireReReviewOnPush: false,
        dismissStaleReviews: false,
      },
      reviews: [{ reviewerId: "u1", state: "approved", submittedAt: new Date() }],
    });

    const result = await canMerge("pr1");
    expect(result.canMerge).toBe(false);
    expect(result.reason).toContain("Code owner approval required");
  });

  it("blocks when required reviewer has not approved", async () => {
    mockDb = makeDb({
      reviewRequirements: {
        minApprovals: 0,
        requireCodeOwner: false,
        requireReReviewOnPush: false,
        dismissStaleReviews: false,
      },
      requiredReviewers: [{ userId: "u_required", isRequired: true }],
      reviews: [{ reviewerId: "u_other", state: "approved", submittedAt: new Date() }],
    });

    const result = await canMerge("pr1");
    expect(result.canMerge).toBe(false);
    expect(result.reason).toContain("Required reviewer approvals missing");
  });

  it("passes when required reviewer latest review is approved", async () => {
    mockDb = makeDb({
      reviewRequirements: {
        minApprovals: 0,
        requireCodeOwner: false,
        requireReReviewOnPush: false,
        dismissStaleReviews: false,
      },
      requiredReviewers: [{ userId: "u_required", isRequired: true }],
      reviews: [{ reviewerId: "u_required", state: "approved", submittedAt: new Date() }],
    });

    const result = await canMerge("pr1");
    expect(result.canMerge).toBe(true);
  });

  it("passes when required checks, external CI, and approvals are satisfied", async () => {
    mockDb = makeDb({
      reviews: [{ reviewerId: "u1", state: "approved", submittedAt: new Date() }],
      requiredStatusChecks: [{ checkName: "build", branch: "main", isRequired: true }],
      workflowRuns: [{ name: "build", status: "success", conclusion: "success", createdAt: new Date() }],
      externalCiConfigs: [{ id: "cfg1", name: "Jenkins", isEnabled: true, syncStatus: true }],
      externalBuilds: [{ configId: "cfg1", status: "success", createdAt: new Date() }],
    });

    const result = await canMerge("pr1");
    expect(result.canMerge).toBe(true);
  });
});
