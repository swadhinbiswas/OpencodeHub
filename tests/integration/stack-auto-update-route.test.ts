import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canWriteRepoMock,
  stackNeedsRebaseMock,
  autoUpdateStackMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canWriteRepoMock: vi.fn(async () => true),
  stackNeedsRebaseMock: vi.fn(async () => ({ needsRebase: true, behindBy: 2 })),
  autoUpdateStackMock: vi.fn(async () => ({ success: true, rebased: [], failed: [], conflicts: [] })),
  fakeSchema: {
    users: { username: {} },
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
  canWriteRepo: canWriteRepoMock,
}));

vi.mock("@/lib/stack-rebase", () => ({
  stackNeedsRebase: stackNeedsRebaseMock,
  autoUpdateStack: autoUpdateStackMock,
}));

import { POST as autoUpdatePost } from "@/pages/api/repos/[owner]/[repo]/stacks/[stackId]/auto-update";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      prStacks: {
        findFirst: vi.fn(async () => ({ id: "stack-1", repositoryId: "repo-1" })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("stack auto-update route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    canWriteRepoMock.mockResolvedValue(true);
    stackNeedsRebaseMock.mockResolvedValue({ needsRebase: true, behindBy: 2 });
    autoUpdateStackMock.mockResolvedValue({ success: true, rebased: [], failed: [], conflicts: [] });
  });

  it("returns 403 when user lacks write access", async () => {
    canWriteRepoMock.mockResolvedValue(false);

    const response = await autoUpdatePost({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "user-1" } },
    } as any);

    expect(response.status).toBe(403);
  });

  it("returns auto-update result with pre-check status", async () => {
    const response = await autoUpdatePost({
      params: { owner: "owner-1", repo: "demo", stackId: "stack-1" },
      locals: { user: { id: "user-1" } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.needsRebase).toBe(true);
    expect(body?.data?.behindBy).toBe(2);
    expect(autoUpdateStackMock).toHaveBeenCalledWith("stack-1");
  });
});

