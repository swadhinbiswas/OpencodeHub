/**
 * Integration tests for POST /api/auth/register
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ─── hoisted mocks ─── */
const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn().mockResolvedValue(null),
  hashPasswordMock: vi.fn().mockResolvedValue("hashed_pw_123"),
  createSessionMock: vi.fn().mockResolvedValue({
    id: "sess_1",
    userId: "usr_new",
    token: "sesstoken",
    userAgent: "vitest",
    ipAddress: null,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  }),
  createTokenMock: vi.fn().mockResolvedValue("jwt_register_token"),
  generateIdMock: vi.fn().mockReturnValue("usr_new"),
  isValidUsernameMock: vi.fn().mockReturnValue(true),
  isValidEmailMock: vi.fn().mockReturnValue(true),
  insertMock: vi
    .fn()
    .mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
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
  hashPassword: mocks.hashPasswordMock,
  createSession: mocks.createSessionMock,
  createToken: mocks.createTokenMock,
  validatePasswordStrength: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

vi.mock("@/lib/utils", () => ({
  generateId: mocks.generateIdMock,
  isValidUsername: mocks.isValidUsernameMock,
  isValidEmail: mocks.isValidEmailMock,
  now: () => new Date(),
}));

vi.mock("@/lib/validation", () => ({
  RegisterUserSchema: {
    safeParse: vi.fn().mockReturnValue({ success: true }),
  },
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
        findFirst: vi.fn().mockResolvedValue(null), // no existing user
      },
    },
    insert: mocks.insertMock,
  };
}

let mockDb: ReturnType<typeof makeDb>;
const readJson = (r: Response) => r.json();

function makeRequest(body: Record<string, unknown>) {
  return {
    request: new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    cookies: { set: vi.fn(), delete: vi.fn() },
  } as any;
}

/* ─── import route ─── */
import { POST } from "@/pages/api/auth/register";

/* ─── tests ─── */
describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
    delete process.env.ENABLE_REGISTRATION;
  });

  it("returns 201 with token for valid registration", async () => {
    const res = await POST(
      makeRequest({
        username: "newuser",
        email: "new@example.com",
        password: "password123",
        displayName: "New User",
      }),
    );
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.data.user.username).toBe("newuser");
    expect(json.data.token).toBe("jwt_register_token");
  });

  it("returns 400 when registration is disabled", async () => {
    process.env.ENABLE_REGISTRATION = "false";
    const res = await POST(
      makeRequest({
        username: "newuser",
        email: "new@example.com",
        password: "password123",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when username already taken", async () => {
    mockDb.query.users.findFirst.mockResolvedValue({
      id: "usr_1",
      username: "newuser",
      email: "other@example.com",
    });
    const res = await POST(
      makeRequest({
        username: "newuser",
        email: "new@example.com",
        password: "password123",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 409 when email already registered", async () => {
    mockDb.query.users.findFirst.mockResolvedValue({
      id: "usr_1",
      username: "other",
      email: "new@example.com",
    });
    const res = await POST(
      makeRequest({
        username: "newuser",
        email: "new@example.com",
        password: "password123",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 when username format invalid", async () => {
    mocks.isValidUsernameMock.mockReturnValue(false);
    const res = await POST(
      makeRequest({
        username: "bad user!",
        email: "new@example.com",
        password: "password123",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when email format invalid", async () => {
    mocks.isValidEmailMock.mockReturnValue(false);
    const res = await POST(
      makeRequest({
        username: "newuser",
        email: "not-an-email",
        password: "password123",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns rate limit response when rate limited", async () => {
    mocks.applyRateLimitMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limited" }), { status: 429 }),
    );
    const res = await POST(
      makeRequest({
        username: "newuser",
        email: "new@example.com",
        password: "password123",
      }),
    );
    expect(res.status).toBe(429);
  });
});
