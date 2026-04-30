import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock database
const mockDb = {
  query: {
    repositoryCollaborators: { findFirst: vi.fn() },
    organizationMembers: { findFirst: vi.fn(), findMany: vi.fn() },
    customRoles: { findFirst: vi.fn() },
    organizations: { findFirst: vi.fn() },
  },
};

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: {
    repositoryCollaborators: {},
    organizationMembers: {},
    customRoles: {},
    organizations: {},
  },
}));

// Now import the module under test
const {
  getRepoPermission,
  getOrgPermission,
  canReadRepo,
  canWriteRepo,
  canAdminRepo,
  canAdminOrg,
} = await import("@/lib/permissions");

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mock implementations to defaults
  mockDb.query.repositoryCollaborators.findFirst.mockResolvedValue(null);
  mockDb.query.organizationMembers.findFirst.mockResolvedValue(null);
  mockDb.query.organizationMembers.findMany.mockResolvedValue([]);
  mockDb.query.customRoles.findFirst.mockResolvedValue(null);
  mockDb.query.organizations.findFirst.mockResolvedValue(null);
});

describe("getRepoPermission", () => {
  const publicRepo = {
    id: "r1",
    ownerId: "u1",
    visibility: "public",
  } as any;

  const privateRepo = {
    id: "r2",
    ownerId: "u1",
    visibility: "private",
  } as any;

  it("returns admin for site admin", async () => {
    const result = await getRepoPermission("u999", privateRepo, {
      isAdmin: true,
    });
    expect(result).toBe("admin");
  });

  it("returns admin for repo owner", async () => {
    const result = await getRepoPermission("u1", publicRepo);
    expect(result).toBe("admin");
  });

  it("returns read for public repo (unauthenticated)", async () => {
    const result = await getRepoPermission(undefined, publicRepo);
    expect(result).toBe("read");
  });

  it("returns none for private repo (unauthenticated)", async () => {
    const result = await getRepoPermission(undefined, privateRepo);
    expect(result).toBe("none");
  });

  it("returns collaborator permission when found", async () => {
    mockDb.query.repositoryCollaborators.findFirst.mockResolvedValue({
      role: "developer",
    });
    const result = await getRepoPermission("u2", privateRepo);
    expect(result).toBe("write");
  });
});

describe("canReadRepo", () => {
  const publicRepo = { id: "r1", ownerId: "u1", visibility: "public" } as any;
  const privateRepo = { id: "r2", ownerId: "u1", visibility: "private" } as any;

  it("allows read on public repo", async () => {
    expect(await canReadRepo(undefined, publicRepo)).toBe(true);
  });

  it("denies read on private repo for unauthenticated user", async () => {
    expect(await canReadRepo(undefined, privateRepo)).toBe(false);
  });

  it("allows read for owner", async () => {
    expect(await canReadRepo("u1", privateRepo)).toBe(true);
  });

  it("allows read for admin", async () => {
    expect(await canReadRepo("u999", privateRepo, { isAdmin: true })).toBe(
      true,
    );
  });
});

describe("canWriteRepo", () => {
  const repo = { id: "r1", ownerId: "u1", visibility: "private" } as any;

  it("allows write for owner", async () => {
    expect(await canWriteRepo("u1", repo)).toBe(true);
  });

  it("denies write for unauthenticated", async () => {
    expect(await canWriteRepo(undefined, repo)).toBe(false);
  });

  it("denies write for reader-only collaborator", async () => {
    mockDb.query.repositoryCollaborators.findFirst.mockResolvedValue({
      role: "guest",
    });
    expect(await canWriteRepo("u2", repo)).toBe(false);
  });

  it("allows write for write collaborator", async () => {
    mockDb.query.repositoryCollaborators.findFirst.mockResolvedValue({
      role: "developer",
    });
    expect(await canWriteRepo("u2", repo)).toBe(true);
  });
});

describe("canAdminRepo", () => {
  const repo = { id: "r1", ownerId: "u1", visibility: "private" } as any;

  it("allows admin for owner", async () => {
    expect(await canAdminRepo("u1", repo)).toBe(true);
  });

  it("allows admin for site admin", async () => {
    expect(await canAdminRepo("u999", repo, { isAdmin: true })).toBe(true);
  });

  it("denies admin for write collaborator", async () => {
    mockDb.query.repositoryCollaborators.findFirst.mockResolvedValue({
      role: "developer",
    });
    expect(await canAdminRepo("u2", repo)).toBe(false);
  });
});

describe("canAdminOrg", () => {
  it("allows for site admin", async () => {
    expect(await canAdminOrg("u999", "org1", { isAdmin: true })).toBe(true);
  });

  it("denies for unauthenticated", async () => {
    expect(await canAdminOrg(undefined, "org1")).toBe(false);
  });
});
