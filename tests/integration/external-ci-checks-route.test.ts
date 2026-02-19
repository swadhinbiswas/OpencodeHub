import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fakeSchema,
  upsertCheckRunMock,
  updateMergeableStateMock,
} = vi.hoisted(() => ({
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    externalCiIntegrations: { repositoryId: {}, id: {}, tokenHash: {}, updatedAt: {} },
    pullRequests: { repositoryId: {}, number: {}, id: {} },
  } as any,
  upsertCheckRunMock: vi.fn(async () => ({})),
  updateMergeableStateMock: vi.fn(async () => undefined),
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/pr-checks", () => ({
  upsertCheckRun: upsertCheckRunMock,
  updateMergeableState: updateMergeableStateMock,
}));

vi.mock("@/lib/air-gapped", () => ({
  isAirGappedMode: () => false,
}));

import { POST as checksPost } from "@/pages/api/repos/[owner]/[repo]/external-ci/checks";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1", username: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      externalCiIntegrations: {
        findFirst: vi.fn(async () => ({
          id: "integration-1",
          repositoryId: "repo-1",
          tokenHash: "b13ae34b9231f95675ff502761b64aedd0c278f5b6e8730ce99b72f35b2ddfb0", // sha256("token123")
        })),
      },
      pullRequests: {
        findFirst: vi.fn(async () => ({
          id: "pr-1",
          repositoryId: "repo-1",
          number: 42,
        })),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("external ci checks route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("accepts provider payloads (github check_run)", async () => {
    const response = await checksPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/external-ci/checks", {
        method: "POST",
        headers: {
          authorization: "Bearer token123",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          check_run: {
            id: 991,
            name: "build",
            head_sha: "abc123",
            status: "completed",
            conclusion: "success",
            pull_requests: [{ number: 42 }],
          },
        }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.provider).toBe("github_actions");
    expect(upsertCheckRunMock).toHaveBeenCalledWith(
      "pr-1",
      expect.objectContaining({
        name: "build",
        headSha: "abc123",
        status: "completed",
        conclusion: "success",
      }),
    );
    expect(updateMergeableStateMock).toHaveBeenCalledWith("pr-1");
  });

  it("returns supported payload hints for invalid body", async () => {
    const response = await checksPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/external-ci/checks", {
        method: "POST",
        headers: {
          authorization: "Bearer token123",
          "content-type": "application/json",
        },
        body: JSON.stringify({ foo: "bar" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body?.error?.details?.acceptedPayloads?.length).toBeGreaterThan(1);
    expect(upsertCheckRunMock).not.toHaveBeenCalled();
  });
});
