/**
 * Integration tests for GET / PATCH / DELETE /api/auth/me
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ─── hoisted mocks ─── */
const mocks = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn().mockResolvedValue({
    userId: "usr_1",
    username: "alice",
    email: "alice@example.com",
  }),
  updateMock: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  }),
  deleteMock: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  }),
  logAuditMock: vi.fn().mockResolvedValue(undefined),
  getRequestMetaMock: vi
    .fn()
    .mockReturnValue({ ip: "127.0.0.1", userAgent: "vitest" }),
  fakeSchema: { users: "users" },
}));

/* ─── module mocks ─── */
vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: mocks.fakeSchema,
}));

vi.mock("@/db/schema", () => ({
  users: "users",
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: mocks.getUserFromRequestMock,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAuditMock,
  getRequestMeta: mocks.getRequestMetaMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/errors", () => ({
  withErrorHandler: (fn: any) => fn,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...a: any[]) => a),
}));

/* ─── helpers ─── */
const fakeUser = {
  id: "usr_1",
  username: "alice",
  email: "alice@example.com",
  displayName: "Alice",
  bio: "Developer",
  avatarUrl: null,
  location: "NYC",
  website: "",
  company: "ACME",
  isAdmin: false,
  emailVerified: true,
  twoFactorEnabled: false,
  createdAt: new Date(),
};

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(fakeUser),
      },
    },
    update: mocks.updateMock,
    delete: mocks.deleteMock,
  };
}

let mockDb: ReturnType<typeof makeDb>;
const readJson = (r: Response) => r.json();

function ctx(method: string, body?: Record<string, unknown>) {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);
  return {
    request: new Request("http://localhost/api/auth/me", init),
    cookies: { set: vi.fn(), delete: vi.fn() },
  } as any;
}

/* ─── import routes ─── */
import { DELETE, GET, PATCH } from "@/pages/api/auth/me";

/* ─── tests ─── */
describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns 200 with user profile", async () => {
    const res = await GET(ctx("GET"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.username).toBe("alice");
    expect(json.email).toBe("alice@example.com");
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await GET(ctx("GET"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when user no longer exists", async () => {
    mockDb.query.users.findFirst.mockResolvedValue(null);
    const res = await GET(ctx("GET"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns 200 when profile updated", async () => {
    const res = await PATCH(ctx("PATCH", { displayName: "Alice W" }));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.message).toContain("updated");
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await PATCH(ctx("PATCH", { displayName: "x" }));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns 200 and deletes account", async () => {
    const res = await DELETE(ctx("DELETE"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.message).toContain("deleted");
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await DELETE(ctx("DELETE"));
    expect(res.status).toBe(401);
  });
});
