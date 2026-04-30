import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateId } from "@/lib/utils";

// Mock @/db before importing modules that use it
const mockDb = {
  execute: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  }),
  insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  query: {
    securityScans: {
      findFirst: vi.fn().mockResolvedValue(undefined),
    },
  },
};

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: {
    users: { id: "id", username: "username", email: "email" },
    repositories: { id: "id", name: "name", ownerId: "ownerId" },
    securityScans: { id: "id", repositoryId: "repositoryId", status: "status" },
    securityVulnerabilities: { id: "id", scanId: "scanId" },
  },
}));

vi.mock("@/lib/security-policies", () => ({
  evaluateLicensePolicy: vi.fn().mockReturnValue({ violated: false }),
  evaluateSecretPolicy: vi.fn().mockReturnValue({ violated: false }),
  getRepositorySecurityPolicy: vi.fn().mockResolvedValue({ enforcementMode: "warn" }),
}));

import { runSecurityScan } from "@/lib/security";

// Mock Dockerode
const mockDockerContainer = {
  start: vi.fn().mockResolvedValue(undefined),
  wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
  logs: vi.fn().mockResolvedValue(Buffer.from("")),
  remove: vi.fn().mockResolvedValue(undefined),
};

const mockDocker = {
  createContainer: vi.fn().mockResolvedValue(mockDockerContainer),
  pull: vi.fn((_image: string, cb: any) => cb(null, {})),
  modem: { followProgress: vi.fn((_stream: any, onFinished: any) => onFinished(null, [])) },
};

vi.mock("dockerode", () => ({
  default: class MockDockerode {
    constructor() {
      return mockDocker as any;
    }
  },
}));

vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => ({
    clone: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn().mockResolvedValue(JSON.stringify({
      Results: [{
        Target: "package-lock.json",
        Class: "lang-pkgs",
        Vulnerabilities: [{
          VulnerabilityID: "CVE-2023-1234",
          PkgName: "test-pkg",
          InstalledVersion: "1.0.0",
          FixedVersion: "1.0.1",
          Severity: "HIGH",
          Title: "Test Vulnerability",
          Description: "A test vulnerability",
        }],
      }],
    })),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Security System", () => {
  const testRepoId = generateId();
  const scanId = generateId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.query.securityScans.findFirst.mockResolvedValue({
      id: scanId,
      repositoryId: testRepoId,
      status: "completed",
      criticalCount: 0,
      highCount: 1,
      mediumCount: 0,
      lowCount: 0,
      unknownCount: 0,
      vulnerabilities: [{
        id: generateId(),
        scanId,
        vulnerabilityId: "CVE-2023-1234",
        pkgName: "test-pkg",
        severity: "HIGH",
      }],
    });
  });

  it("should run security scan and save results", async () => {
    await runSecurityScan("/tmp/test-repo", scanId, testRepoId);

    expect(mockDocker.createContainer).toHaveBeenCalled();
    expect(mockDockerContainer.start).toHaveBeenCalled();
    expect(mockDockerContainer.wait).toHaveBeenCalled();

    const scan = await mockDb.query.securityScans.findFirst({
      where: expect.anything(),
      with: { vulnerabilities: true },
    });

    expect(scan).toBeDefined();
    expect(scan.status).toBe("completed");
    expect(scan.highCount).toBe(1);
  });
});
