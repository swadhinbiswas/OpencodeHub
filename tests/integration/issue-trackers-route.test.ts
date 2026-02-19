import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserFromRequestMock,
  canReadRepoMock,
  canWriteRepoMock,
  configureIssueTrackerMock,
  getIssueTrackerConfigsMock,
  fakeSchema,
} = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(async () => ({ userId: "user-1", isAdmin: false })),
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  configureIssueTrackerMock: vi.fn(async () => ({
    id: "cfg-1",
    repositoryId: "repo-1",
    provider: "jira",
    name: "Jira",
    projectKey: "PROJ",
    webhookSecret: "secret-1",
    apiToken: "hidden",
  })),
  getIssueTrackerConfigsMock: vi.fn(async () => ([])),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
    issueTrackerLinks: { configId: {}, createdAt: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: getUserFromRequestMock,
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
  canWriteRepo: canWriteRepoMock,
}));

vi.mock("@/lib/issue-trackers", () => ({
  ISSUE_PROVIDERS: {
    jira: { name: "Jira" },
    linear: { name: "Linear" },
    trello: { name: "Trello" },
    clickup: { name: "ClickUp" },
  },
  configureIssueTracker: configureIssueTrackerMock,
  getIssueTrackerConfigs: getIssueTrackerConfigsMock,
}));

import { GET as issueTrackersGet, POST as issueTrackersPost } from "@/pages/api/repos/[owner]/[repo]/integrations/issue-trackers";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
      issueTrackerLinks: {
        findMany: vi.fn(async () => ([
          {
            id: "link-1",
            configId: "cfg-jira",
            externalId: "10001",
            externalKey: "PROJ-1",
            externalUrl: "https://jira.example.com/browse/PROJ-1",
            lastSyncAt: new Date("2026-02-19T00:00:00Z"),
            createdAt: new Date("2026-02-19T00:00:00Z"),
          },
        ])),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("issue trackers route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    getIssueTrackerConfigsMock.mockResolvedValue([
      {
        id: "cfg-jira",
        repositoryId: "repo-1",
        provider: "jira",
        name: "Jira",
        projectKey: "PROJ",
        apiToken: "secret",
        webhookSecret: "secret-1",
        isEnabled: true,
        syncToExternal: true,
        syncFromExternal: true,
      },
    ]);
  });

  it("returns providers and configs", async () => {
    const response = await issueTrackersGet({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/issue-trackers"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.providers?.length).toBe(4);
    expect(body?.data?.configs?.[0]?.provider).toBe("jira");
    expect(body?.data?.configs?.[0]?.apiToken).toBeUndefined();
    expect(body?.data?.links).toBeUndefined();
  });

  it("returns summary links when summary=1", async () => {
    const response = await issueTrackersGet({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/issue-trackers?summary=1"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.links?.length).toBe(1);
    expect(body?.data?.links?.[0]?.externalKey).toBe("PROJ-1");
  });

  it("creates provider configs for all issue-tracker providers", async () => {
    for (const provider of ["jira", "linear", "trello", "clickup"] as const) {
      const response = await issueTrackersPost({
        params: { owner: "owner-1", repo: "demo" },
        request: new Request("http://localhost/api/repos/owner-1/demo/integrations/issue-trackers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider,
            name: provider,
            apiToken: "token-1",
            projectKey: "proj-1",
            ...(provider === "jira" ? { apiUrl: "https://jira.example.com/rest/api/3" } : {}),
          }),
        }),
      } as any);

      expect(response.status).toBe(200);
    }

    expect(configureIssueTrackerMock).toHaveBeenCalledTimes(4);
  });
});
