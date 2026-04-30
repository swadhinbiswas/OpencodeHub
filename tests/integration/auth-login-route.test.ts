/**
 * Integration tests for POST /api/auth/login
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ─── hoisted mocks ─── */
const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn().mockResolvedValue(null),
  verifyPasswordMock: vi.fn().mockResolvedValue(true),
  verify2FATokenMock: vi.fn().mockReturnValue(true),
  createSessionMock: vi.fn().mockResolvedValue({
    id: "sess_1",
    userId: "usr_1",
    token: "sesstoken",
    userAgent: "vitest",
    ipAddress: "127.0.0.1",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  }),
  createTokenMock: vi.fn().mockResolvedValue("jwt_token_xyz"),
  insertMock: vi
    .fn()
    .mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  updateMock: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  }),
  fakeSchema: { users: "users", sessions: "sessions" },
}));

/* ─── module mocks ─── */
vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: mocks.fakeSchema,
}));

vi.mock("@/db/schema", () => ({
  users: "users",
  sessions: "sessions",
}));

vi.mock("@/middleware/rate-limit", () => ({
  applyRateLimit: mocks.applyRateLimitMock,
}));

vi.mock("@/lib/auth", () => ({
  verifyPassword: mocks.verifyPasswordMock,
  verify2FAToken: mocks.verify2FATokenMock,
  createSession: mocks.createSessionMock,
  createToken: mocks.createTokenMock,
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
function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue({
          id: "usr_1",
          username: "alice",
          email: "alice@example.com",
          passwordHash: "hashed_pw",
          isActive: true,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          displayName: "Alice",
          avatarUrl: null,
          isAdmin: false,
        }),
      },
    },
    insert: mocks.insertMock,
    update: mocks.updateMock,
  };
}

let mockDb: ReturnType<typeof makeDb>;
const readJson = (r: Response) => r.json();

function makeRequest(body: Record<string, unknown>) {
  return {
    request: new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    cookies: { set: vi.fn(), delete: vi.fn() },
  } as any;
}

/* ─── import route ─── */
import { POST } from "@/pages/api/auth/login";

/* ─── tests ─── */
describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    // Reset mock implementations that may have been changed by other tests
    mocks.verifyPasswordMock.mockResolvedValue(true);
    mocks.verify2FATokenMock.mockReturnValue(true);
    mocks.applyRateLimitMock.mockResolvedValue(null);
  });

  it("returns 200 with token for valid credentials", async () => {
    const res = await POST(
      makeRequest({ login: "alice", password: "pass1234" }),
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.user.username).toBe("alice");
    expect(json.data.token).toBe("jwt_token_xyz");
  });

  it("returns 401 when user not found", async () => {
    mockDb.query.users.findFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({ login: "nobody", password: "pass" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when account disabled", async () => {
    mockDb.query.users.findFirst.mockResolvedValue({
      id: "usr_1",
      username: "alice",
      isActive: false,
      passwordHash: "hashed",
    });
    const res = await POST(makeRequest({ login: "alice", password: "pass" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when password is wrong", async () => {
    mocks.verifyPasswordMock.mockResolvedValue(false);
    const res = await POST(makeRequest({ login: "alice", password: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns requiresTwoFactor when 2FA enabled but no code", async () => {
    mockDb.query.users.findFirst.mockResolvedValue({
      id: "usr_1",
      username: "alice",
      passwordHash: "hashed",
      isActive: true,
      twoFactorEnabled: true,
      twoFactorSecret: "secret",
    });
    const res = await POST(makeRequest({ login: "alice", password: "pass" }));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.requiresTwoFactor).toBe(true);
  });

  it("returns 401 when 2FA code is invalid", async () => {
    mockDb.query.users.findFirst.mockResolvedValue({
      id: "usr_1",
      username: "alice",
      passwordHash: "hashed",
      isActive: true,
      twoFactorEnabled: true,
      twoFactorSecret: "secret",
    });
    mocks.verify2FATokenMock.mockReturnValue(false);
    const res = await POST(
      makeRequest({ login: "alice", password: "pass", totpCode: "000000" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns rate limit response when rate limited", async () => {
    mocks.applyRateLimitMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limited" }), { status: 429 }),
    );
    const res = await POST(makeRequest({ login: "alice", password: "pass" }));
    expect(res.status).toBe(429);
  });

  it("returns 401 when user has no passwordHash", async () => {
    mockDb.query.users.findFirst.mockResolvedValue({
      id: "usr_1",
      username: "alice",
      passwordHash: null,
      isActive: true,
      twoFactorEnabled: false,
    });
    const res = await POST(makeRequest({ login: "alice", password: "pass" }));
    expect(res.status).toBe(401);
  });
});
