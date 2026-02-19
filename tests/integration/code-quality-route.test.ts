import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserFromRequestMock,
  canReadRepoMock,
  canWriteRepoMock,
  getQualityConfigsMock,
  getCoverageHistoryMock,
  getQualityIssuesMock,
  configureQualityProviderMock,
  fakeSchema,
} = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(async () => ({ userId: "user-1", isAdmin: false })),
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  getQualityConfigsMock: vi.fn(async () => []),
  getCoverageHistoryMock: vi.fn(async () => []),
  getQualityIssuesMock: vi.fn(async () => []),
  configureQualityProviderMock: vi.fn(async () => ({
    id: "quality-1",
    repositoryId: "repo-1",
    provider: "codecov",
    projectKey: "owner/demo",
    webhookSecret: "secret-1",
    minCoverage: 85,
    blockOnFail: true,
    isEnabled: true,
    reportOnPR: true,
  })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
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

vi.mock("@/lib/code-quality", () => ({
  QUALITY_PROVIDERS: {
    codecov: { name: "Codecov" },
    coveralls: { name: "Coveralls" },
    sonarqube: { name: "SonarQube" },
    snyk: { name: "Snyk" },
  },
  getQualityConfigs: getQualityConfigsMock,
  getCoverageHistory: getCoverageHistoryMock,
  getQualityIssues: getQualityIssuesMock,
  configureQualityProvider: configureQualityProviderMock,
}));

import { GET as codeQualityGet, POST as codeQualityPost } from "@/pages/api/repos/[owner]/[repo]/integrations/code-quality";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("code quality integrations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns summary including coverage and issues", async () => {
    getQualityConfigsMock.mockResolvedValue([
      {
        id: "quality-1",
        repositoryId: "repo-1",
        provider: "codecov",
        webhookSecret: "secret-1",
        apiToken: "token",
      },
    ]);
    getCoverageHistoryMock.mockResolvedValue([{ id: "cov-1", provider: "codecov", coverage: 89.2 }]);
    getQualityIssuesMock.mockResolvedValue([{ id: "issue-1", provider: "sonarqube", severity: "major" }]);

    const response = await codeQualityGet({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/code-quality?summary=1"),
      url: new URL("http://localhost/api/repos/owner-1/demo/integrations/code-quality?summary=1"),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.providers?.length).toBe(4);
    expect(body?.data?.configs?.[0]?.provider).toBe("codecov");
    expect(body?.data?.configs?.[0]?.apiToken).toBeUndefined();
    expect(body?.data?.coverage?.[0]?.provider).toBe("codecov");
    expect(body?.data?.issues?.[0]?.provider).toBe("sonarqube");
  });

  it("creates codecov quality config for authorized writers", async () => {
    const response = await codeQualityPost({
      params: { owner: "owner-1", repo: "demo" },
      request: new Request("http://localhost/api/repos/owner-1/demo/integrations/code-quality", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "codecov",
          projectKey: "owner/demo",
          apiToken: "token-1",
          minCoverage: 85,
          blockOnFail: true,
        }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(configureQualityProviderMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      provider: "codecov",
      projectKey: "owner/demo",
      apiToken: "token-1",
      serverUrl: undefined,
      minCoverage: 85,
      blockOnFail: true,
    });
    expect(body?.data?.provider).toBe("codecov");
    expect(body?.data?.apiToken).toBeUndefined();
  });

  it("creates non-codecov quality configs for coveralls/sonarqube/snyk", async () => {
    for (const provider of ["coveralls", "sonarqube", "snyk"] as const) {
      const response = await codeQualityPost({
        params: { owner: "owner-1", repo: "demo" },
        request: new Request("http://localhost/api/repos/owner-1/demo/integrations/code-quality", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider,
            projectKey: "owner/demo",
            apiToken: "token-1",
            ...(provider === "sonarqube" ? { serverUrl: "https://sonar.example.com" } : {}),
          }),
        }),
      } as any);

      expect(response.status).toBe(200);
    }
    expect(configureQualityProviderMock).toHaveBeenCalledTimes(3);
  });
});
