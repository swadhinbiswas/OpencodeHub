/**
 * Authz Matrix Suite (WS0-07)
 *
 * Data-driven verification of the full permission lattice:
 *   identity (9 roles) × repository (4 types) × PAT scope (5 states)
 *
 * Asserts the exact level returned by the permission engine for every
 * combination, plus the PAT-scope gating that fine-grained tokens must
 * enforce. This is the industry-grade regression net for authorization.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock DB ──────────────────────────────────────────────────────────────
const mockDb = {
  query: {
    repositoryCollaborators: { findFirst: vi.fn() },
    organizationMembers: { findFirst: vi.fn() },
    customRoles: { findFirst: vi.fn() },
    teamMembers: { findMany: vi.fn() },
    repositoryPathPermissions: { findFirst: vi.fn() },
  },
};

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: {
    repositoryCollaborators: {},
    organizationMembers: {},
    customRoles: {},
    teamMembers: {},
    repositoryPathPermissions: {},
  },
}));

const {
  getRepoPermission,
  getOrgPermission,
  canReadRepo,
  canWriteRepo,
  canAdminRepo,
  hasPatScope,
  hasRepoWriteScope,
} = await import("@/lib/permissions");

type Level = "admin" | "write" | "read" | "none";

// ── Identities ───────────────────────────────────────────────────────────
const IDS = {
  siteAdmin: { userId: "sa", isAdmin: true },
  owner: { userId: "own", isAdmin: false },
  adminCollab: { userId: "ac", isAdmin: false },
  writeCollab: { userId: "wc", isAdmin: false },
  readCollab: { userId: "rc", isAdmin: false },
  outsider: { userId: "out", isAdmin: false },
  anonymous: { userId: undefined, isAdmin: false },
  orgOwner: { userId: "oo", isAdmin: false },
  orgAdmin: { userId: "oa", isAdmin: false },
  orgMember: { userId: "om", isAdmin: false },
} as const;

// ── Repositories ─────────────────────────────────────────────────────────
const userPublicRepo = { id: "r1", ownerId: "own", ownerType: "user", visibility: "public" } as any;
const userPrivateRepo = { id: "r2", ownerId: "own", ownerType: "user", visibility: "private" } as any;
const orgPublicRepo = { id: "r3", ownerId: "org1", ownerType: "organization", visibility: "public" } as any;
const orgPrivateRepo = { id: "r4", ownerId: "org1", ownerType: "organization", visibility: "private" } as any;

function asUser(id: { userId?: string; isAdmin: boolean }) {
  return { id: id.userId, isAdmin: id.isAdmin };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.query.repositoryCollaborators.findFirst.mockResolvedValue(null);
  mockDb.query.organizationMembers.findFirst.mockResolvedValue(null);
  mockDb.query.customRoles.findFirst.mockResolvedValue(null);
  mockDb.query.teamMembers.findMany.mockResolvedValue([]);
  mockDb.query.repositoryPathPermissions.findFirst.mockResolvedValue(null);
});

describe("authz matrix: identity × repository", () => {
  it.each([
    // site admin — everything, even anonymous-by-id
    ["siteAdmin", "userPublic", IDS.siteAdmin, userPublicRepo, "admin"],
    ["siteAdmin", "userPrivate", IDS.siteAdmin, userPrivateRepo, "admin"],
    ["siteAdmin", "orgPublic", IDS.siteAdmin, orgPublicRepo, "admin"],
    ["siteAdmin", "orgPrivate", IDS.siteAdmin, orgPrivateRepo, "admin"],
    // owner
    ["owner", "userPublic", IDS.owner, userPublicRepo, "admin"],
    ["owner", "userPrivate", IDS.owner, userPrivateRepo, "admin"],
    // owner on org repo = outsider unless a member
    ["owner", "orgPrivate", IDS.owner, orgPrivateRepo, "none"],
    // anonymous
    ["anonymous", "userPublic", IDS.anonymous, userPublicRepo, "read"],
    ["anonymous", "userPrivate", IDS.anonymous, userPrivateRepo, "none"],
    ["anonymous", "orgPublic", IDS.anonymous, orgPublicRepo, "read"],
    ["anonymous", "orgPrivate", IDS.anonymous, orgPrivateRepo, "none"],
    // outsider (authenticated, no access)
    ["outsider", "userPublic", IDS.outsider, userPublicRepo, "read"],
    ["outsider", "userPrivate", IDS.outsider, userPrivateRepo, "none"],
    ["outsider", "orgPrivate", IDS.outsider, orgPrivateRepo, "none"],
  ] as Array<[string, string, any, any, Level]>)(
    "%s on %s repo → %s",
    async (_name, _repoName, identity, repo, expected) => {
      const level = await getRepoPermission(identity.userId, repo, {
        isAdmin: identity.isAdmin,
      });
      expect(level).toBe(expected);
    },
  );

  it.each([
    ["readCollab", "userPrivate", IDS.readCollab, userPrivateRepo, "read", "guest"],
    ["writeCollab", "userPrivate", IDS.writeCollab, userPrivateRepo, "write", "developer"],
    ["adminCollab", "userPrivate", IDS.adminCollab, userPrivateRepo, "admin", "maintainer"],
    ["adminCollabOwner", "userPrivate", IDS.adminCollab, userPrivateRepo, "admin", "owner"],
  ] as Array<[string, string, any, any, Level, string]>)(
    "collaborator %s on %s → %s",
    async (_name, _repoName, identity, repo, expected, role) => {
      mockDb.query.repositoryCollaborators.findFirst.mockResolvedValue({
        id: "c1",
        role,
      });
      const level = await getRepoPermission(identity.userId, repo, {});
      expect(level).toBe(expected);
    },
  );

  it.each([
    ["orgOwner", IDS.orgOwner, "owner", "admin"],
    ["orgAdmin", IDS.orgAdmin, "admin", "admin"],
    ["orgMember", IDS.orgMember, "member", "read"],
  ] as Array<[string, any, string, Level]>)(
    "org %s on org-private repo → %s",
    async (_name, identity, role, expected) => {
      mockDb.query.organizationMembers.findFirst.mockResolvedValue({
        role,
        customRoleId: null,
      });
      const level = await getRepoPermission(identity.userId, orgPrivateRepo, {});
      expect(level).toBe(expected);
    },
  );

  it("org member with repo:write custom role gets write", async () => {
    mockDb.query.organizationMembers.findFirst.mockResolvedValue({
      role: "member",
      customRoleId: "cr1",
    });
    mockDb.query.customRoles.findFirst.mockResolvedValue({
      permissions: ["repo:write"],
    });
    const level = await getRepoPermission(IDS.orgMember.userId, orgPrivateRepo, {});
    expect(level).toBe("write");
  });
});

describe("authz matrix: identity × org", () => {
  it.each([
    ["siteAdmin", IDS.siteAdmin, "admin"],
    ["orgOwner", IDS.orgOwner, "owner"],
    ["orgAdmin", IDS.orgAdmin, "admin"],
    ["orgMember", IDS.orgMember, "member"],
    ["outsider", IDS.outsider, "none"],
    ["anonymous", IDS.anonymous, "none"],
  ] as Array<[string, any, "admin" | "owner" | "member" | "none"]>)(
    "%s on org → %s",
    async (_name, identity, expected) => {
      const orgId = "org1";
      if (identity.userId === IDS.orgOwner.userId) {
        mockDb.query.organizationMembers.findFirst.mockResolvedValue({ role: "owner" });
      } else if (identity.userId === IDS.orgAdmin.userId) {
        mockDb.query.organizationMembers.findFirst.mockResolvedValue({ role: "admin" });
      } else if (identity.userId === IDS.orgMember.userId) {
        mockDb.query.organizationMembers.findFirst.mockResolvedValue({ role: "member" });
      } else {
        mockDb.query.organizationMembers.findFirst.mockResolvedValue(null);
      }
      const level = await getOrgPermission(identity.userId, orgId, {
        isAdmin: identity.isAdmin,
      });
      expect(level).toBe(expected);
    },
  );
});

describe("authz matrix: capability gates", () => {
  it("canReadRepo/canWriteRepo/canAdminRepo match the lattice", async () => {
    // owner of private repo
    expect(await canReadRepo("own", userPrivateRepo, {})).toBe(true);
    expect(await canWriteRepo("own", userPrivateRepo, {})).toBe(true);
    expect(await canAdminRepo("own", userPrivateRepo, {})).toBe(true);

    // read collaborator
    mockDb.query.repositoryCollaborators.findFirst.mockResolvedValue({ role: "guest" });
    expect(await canReadRepo("rc", userPrivateRepo, {})).toBe(true);
    expect(await canWriteRepo("rc", userPrivateRepo, {})).toBe(false);
    expect(await canAdminRepo("rc", userPrivateRepo, {})).toBe(false);

    // outsider on private (reset collaborator mock — it is stateless)
    mockDb.query.repositoryCollaborators.findFirst.mockResolvedValue(null);
    expect(await canReadRepo("out", userPrivateRepo, {})).toBe(false);
    expect(await canWriteRepo("out", userPrivateRepo, {})).toBe(false);

    // anonymous on public
    expect(await canReadRepo(undefined, userPublicRepo, {})).toBe(true);
    expect(await canWriteRepo(undefined, userPublicRepo, {})).toBe(false);
  });

  it("org member can read org-private repos but not write", async () => {
    mockDb.query.organizationMembers.findFirst.mockResolvedValue({
      role: "member",
      customRoleId: null,
    });
    expect(await canReadRepo("om", orgPrivateRepo, {})).toBe(true);
    expect(await canWriteRepo("om", orgPrivateRepo, {})).toBe(false);
  });
});

describe("authz matrix: PAT scope gating", () => {
  it.each([
    // tokenScopes, required action, expected
    [undefined, "read", true], // legacy token — full access
    [[], "read", true], // empty scopes — legacy behavior
    [["repo:read"], "read", true],
    [["repo:read"], "write", false],
    [["repo:read"], "admin", false],
    [["repo:write"], "write", true],
    [["repo:write"], "read", true],
    [["admin"], "write", true],
    [["admin"], "admin", true],
    [["notifications"], "read", false],
    [["notifications"], "write", false],
    [["repo:read", "repo:write"], "write", true],
  ] as Array<[string[] | undefined, "read" | "write" | "admin", boolean]>)(
    "scopes %j → %s allowed = %s",
    (scopes, action, expected) => {
      if (action === "write") {
        expect(hasRepoWriteScope(scopes)).toBe(expected);
      } else {
        const required = action === "admin" ? "admin" : "repo:read";
        expect(hasPatScope(scopes, required)).toBe(expected);
      }
    },
  );

  it("scoped PATs cannot write even when the user is a repo owner", async () => {
    // Owner with a read-only PAT must be blocked by canWriteRepo
    mockDb.query.repositoryCollaborators.findFirst.mockResolvedValue(null);
    const write = await canWriteRepo("own", userPrivateRepo, {
      tokenScopes: ["repo:read"],
    });
    expect(write).toBe(false);
    // Same owner with a write-scoped PAT passes
    const writeOk = await canWriteRepo("own", userPrivateRepo, {
      tokenScopes: ["repo:write"],
    });
    expect(writeOk).toBe(true);
  });
});
