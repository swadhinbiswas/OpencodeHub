/**
 * Integration tests for GET /api/user
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ─── hoisted mocks ─── */
const mocks = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn().mockResolvedValue({
    userId: "usr_1",
    username: "alice",
    email: "alice@example.com",
  }),
  fakeSchema: { users: "users" },
}));

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: mocks.fakeSchema,
}));

vi.mock("@/db/schema/users", () => ({
  users: { id: "id" },
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: mocks.getUserFromRequestMock,
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
  avatarUrl: null,
  bio: "dev",
  location: "NYC",
  website: "",
  company: "ACME",
  isAdmin: false,
  createdAt: new Date(),
};

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(fakeUser),
      },
    },
  };
}

let mockDb: ReturnType<typeof makeDb>;
const readJson = (r: Response) => r.json();

function ctx() {
  return {
    request: new Request("http://localhost/api/user"),
  } as any;
}

/* ─── import route ─── */
import { GET } from "@/pages/api/user/index";

/* ─── tests ─── */
describe("GET /api/user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns 200 with user profile", async () => {
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.username).toBe("alice");
    expect(json.email).toBe("alice@example.com");
    expect(json.id).toBe("usr_1");
    expect(json.isAdmin).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await GET(ctx());
    expect(res.status).toBe(401);
  });

  it("returns 401 when user not found in db", async () => {
    mockDb.query.users.findFirst.mockResolvedValue(null);
    const res = await GET(ctx());
    expect(res.status).toBe(401);
  });

  it("does not include passwordHash in response", async () => {
    mockDb.query.users.findFirst.mockResolvedValue({
      ...fakeUser,
      passwordHash: "secret_hash",
    });
    const res = await GET(ctx());
    const json = await readJson(res);
    expect(json.passwordHash).toBeUndefined();
  });

  it("includes all expected fields", async () => {
    const res = await GET(ctx());
    const json = await readJson(res);
    const expectedFields = [
      "id",
      "username",
      "email",
      "displayName",
      "avatarUrl",
      "bio",
      "location",
      "website",
      "company",
      "isAdmin",
      "createdAt",
    ];
    for (const field of expectedFields) {
      expect(json).toHaveProperty(field);
    }
  });
});
