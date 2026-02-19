import { beforeEach, describe, expect, it, vi } from "vitest";

let mockDb: any;
const getDatabaseMock = vi.fn(() => mockDb);

const fakeSchema: any = {
  pullRequests: { id: {} },
  requiredStatusChecks: { repositoryId: {} },
  mergeGates: { repositoryId: {} },
  pullRequestLabels: { pullRequestId: {} },
};

vi.mock("@/db", () => ({
  getDatabase: getDatabaseMock,
  schema: fakeSchema,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const { evaluateGates } = await import("@/lib/ci-gates");

function makeDb(overrides: Partial<Record<string, unknown>> = {}) {
  const pr = (overrides.pr as any) || {
    id: "pr-1",
    repositoryId: "repo-1",
    baseBranch: "main",
    mergeable: true,
    checks: [],
    reviews: [],
  };

  return {
    query: {
      pullRequests: {
        findFirst: vi.fn(async () => pr),
      },
      requiredStatusChecks: {
        findMany: vi.fn(async () => (overrides.requiredChecks as any[]) || []),
      },
      mergeGates: {
        findMany: vi.fn(async () => (overrides.mergeGates as any[]) || []),
      },
      pullRequestLabels: {
        findMany: vi.fn(async () => (overrides.prLabels as any[]) || []),
      },
    },
  };
}

describe("ci gate evaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails label gate when required labels are missing", async () => {
    mockDb = makeDb({
      mergeGates: [
        {
          id: "gate-1",
          repositoryId: "repo-1",
          name: "Label gate",
          gateType: "label",
          config: JSON.stringify({ required: ["ready"] }),
          conditionScript: null,
          isEnabled: true,
          order: 0,
        },
      ],
      prLabels: [{ label: { name: "needs-review" } }],
      pr: {
        id: "pr-1",
        repositoryId: "repo-1",
        baseBranch: "main",
        mergeable: true,
        checks: [],
        reviews: [{ reviewerId: "u1", state: "approved", submittedAt: new Date() }],
      },
    });

    const result = await evaluateGates("pr-1");
    expect(result.canMerge).toBe(false);
    expect(result.results.some((gate) => gate.message.includes("Missing required labels"))).toBe(true);
  });

  it("fails review gate when latest review is changes requested", async () => {
    mockDb = makeDb({
      mergeGates: [
        {
          id: "gate-2",
          repositoryId: "repo-1",
          name: "Review gate",
          gateType: "review",
          config: JSON.stringify({ minReviews: 1 }),
          conditionScript: null,
          isEnabled: true,
          order: 0,
        },
      ],
      pr: {
        id: "pr-1",
        repositoryId: "repo-1",
        baseBranch: "main",
        mergeable: true,
        checks: [],
        reviews: [
          { reviewerId: "u1", state: "approved", submittedAt: new Date("2026-02-18T10:00:00Z"), createdAt: new Date("2026-02-18T10:00:00Z") },
          { reviewerId: "u1", state: "changes_requested", submittedAt: new Date("2026-02-18T11:00:00Z"), createdAt: new Date("2026-02-18T11:00:00Z") },
        ],
      },
    });

    const result = await evaluateGates("pr-1");
    expect(result.canMerge).toBe(false);
    expect(result.results.some((gate) => gate.message.includes("Changes requested"))).toBe(true);
  });

  it("passes review gate when minimum approvals are met with latest states", async () => {
    mockDb = makeDb({
      mergeGates: [
        {
          id: "gate-3",
          repositoryId: "repo-1",
          name: "Review gate",
          gateType: "review",
          config: JSON.stringify({ minReviews: 2 }),
          conditionScript: null,
          isEnabled: true,
          order: 0,
        },
      ],
      pr: {
        id: "pr-1",
        repositoryId: "repo-1",
        baseBranch: "main",
        mergeable: true,
        checks: [],
        reviews: [
          { reviewerId: "u1", state: "approved", submittedAt: new Date("2026-02-18T10:00:00Z"), createdAt: new Date("2026-02-18T10:00:00Z") },
          { reviewerId: "u2", state: "commented", submittedAt: new Date("2026-02-18T09:00:00Z"), createdAt: new Date("2026-02-18T09:00:00Z") },
          { reviewerId: "u2", state: "approved", submittedAt: new Date("2026-02-18T12:00:00Z"), createdAt: new Date("2026-02-18T12:00:00Z") },
        ],
      },
    });

    const result = await evaluateGates("pr-1");
    expect(result.canMerge).toBe(true);
    expect(result.results.some((gate) => gate.message.includes("Review requirements met"))).toBe(true);
  });
});
