/**
 * Integration tests for GET /api/orgs/[org]/members
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ─── hoisted mocks ─── */
const mocks = vi.hoisted(() => ({
  canAdminOrgMock: vi.fn().mockResolvedValue(true),
  fakeSchema: {
    organizations: { name: "name" },
    organizationMembers: { organizationId: "organizationId" },
  },
}));

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: mocks.fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  canAdminOrg: mocks.canAdminOrgMock,
}));

vi.mock("@/lib/errors", () => ({
  withErrorHandler: (fn: any) => fn,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...a: any[]) => a),
  and: vi.fn((...a: any[]) => a),
}));

/* ─── helpers ─── */
const fakeOrg = { id: "org_1", name: "acme" };
const fakeMembers = [
  {
    id: "mem_1",
    userId: "usr_1",
    role: "admin",
    user: { id: "usr_1", username: "alice" },
  },
  {
    id: "mem_2",
    userId: "usr_2",
    role: "member",
    user: { id: "usr_2", username: "bob" },
  },
];

function makeDb() {
  return {
    query: {
      organizations: {
        findFirst: vi.fn().mockResolvedValue(fakeOrg),
      },
      organizationMembers: {
        findMany: vi.fn().mockResolvedValue(fakeMembers),
      },
    },
  };
}

let mockDb: ReturnType<typeof makeDb>;
const readJson = (r: Response) => r.json();

function ctx(org: string, user?: { id: string; isAdmin: boolean }) {
  return {
    params: { org },
    locals: {
      user: user || { id: "usr_1", isAdmin: false },
    },
  } as any;
}

/* ─── import route ─── */
import { GET } from "@/pages/api/orgs/[org]/members";

/* ─── tests ─── */
describe("GET /api/orgs/[org]/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    mocks.canAdminOrgMock.mockResolvedValue(true);
  });

  it("returns 200 with members list", async () => {
    const res = await GET(ctx("acme"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.members).toHaveLength(2);
    expect(json.data.members[0].user.username).toBe("alice");
  });

  it("returns 401 when not authenticated", async () => {
    const res = await GET({ params: { org: "acme" }, locals: {} } as any);
    expect(res.status).toBe(401);
  });

  it("returns 400 when org param missing", async () => {
    const res = await GET(ctx(undefined as any));
    expect(res.status).toBe(400);
  });

  it("returns 404 when organization not found", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(null);
    const res = await GET(ctx("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user cannot admin org", async () => {
    mocks.canAdminOrgMock.mockResolvedValue(false);
    const res = await GET(ctx("acme"));
    expect(res.status).toBe(403);
  });

  it("handles empty members list", async () => {
    mockDb.query.organizationMembers.findMany.mockResolvedValue([]);
    const res = await GET(ctx("acme"));
    const json = await readJson(res);
    expect(json.data.members).toEqual([]);
  });
});
