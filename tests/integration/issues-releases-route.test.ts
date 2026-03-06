/**
 * Integration tests for POST /api/repos/[owner]/[repo]/issues and GET/POST /api/repos/[owner]/[repo]/releases
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ─── hoisted mocks ─── */
const mocks = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn().mockResolvedValue({
    userId: "usr_1",
    username: "alice",
    email: "alice@example.com",
  }),
  canReadRepoMock: vi.fn().mockResolvedValue(true),
  canWriteRepoMock: vi.fn().mockResolvedValue(true),
  generateIdMock: vi.fn().mockReturnValue("issue_new"),
  logActivityMock: vi.fn().mockResolvedValue(undefined),
  autoLinkCrossRepoIssuesMock: vi.fn().mockResolvedValue(undefined),
  insertMock: vi
    .fn()
    .mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  updateMock: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  }),
  selectMock: vi.fn(),
  fakeSchema: {
    users: { username: "username" },
    repositories: {
      ownerId: "ownerId",
      name: "name",
      openIssueCount: "openIssueCount",
      id: "id",
    },
    issues: { repositoryId: "repositoryId", number: "number" },
    releases: {
      repositoryId: "repositoryId",
      id: "id",
      createdAt: "createdAt",
    },
    tags: { repositoryId: "repositoryId", name: "name" },
  },
}));

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: mocks.fakeSchema,
}));

vi.mock("@/db/schema", () => ({
  issues: mocks.fakeSchema.issues,
  repositories: mocks.fakeSchema.repositories,
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: mocks.getUserFromRequestMock,
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: mocks.canReadRepoMock,
  canWriteRepo: mocks.canWriteRepoMock,
}));

vi.mock("@/lib/utils", () => ({
  generateId: mocks.generateIdMock,
  now: () => new Date(),
}));

vi.mock("@/lib/activity", () => ({
  logActivity: mocks.logActivityMock,
}));

vi.mock("@/lib/cross-repo-issues", () => ({
  autoLinkCrossRepoIssues: mocks.autoLinkCrossRepoIssuesMock,
}));

vi.mock("@/lib/errors", () => ({
  withErrorHandler: (fn: any) => fn,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/email", () => ({
  sendIssueEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...a: any[]) => a),
  and: vi.fn((...a: any[]) => a),
  desc: vi.fn(),
  sql: vi.fn(),
}));

/* ─── helpers ─── */
const fakeOwner = {
  id: "usr_owner",
  username: "owner",
  email: "owner@example.com",
};
const fakeRepo = {
  id: "repo_1",
  name: "my-repo",
  ownerId: "usr_owner",
  isPrivate: false,
  openIssueCount: 3,
};

function makeDb() {
  return {
    query: {
      users: { findFirst: vi.fn().mockResolvedValue(fakeOwner) },
      repositories: { findFirst: vi.fn().mockResolvedValue(fakeRepo) },
      issues: {
        findFirst: vi.fn().mockResolvedValue({ id: "issue_1", number: 5 }),
      },
      releases: {
        findFirst: vi.fn().mockResolvedValue({
          id: "rel_1",
          name: "v1.0",
          repositoryId: "repo_1",
          isDraft: false,
        }),
      },
      tags: {
        findFirst: vi.fn().mockResolvedValue({ id: "tag_1", name: "v1.0" }),
      },
    },
    insert: mocks.insertMock,
    update: mocks.updateMock,
    select: mocks.selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([
            { id: "rel_1", name: "v1.0", isDraft: false },
            { id: "rel_2", name: "v1.1-beta", isDraft: true },
          ]),
        }),
      }),
    }),
  };
}

let mockDb: ReturnType<typeof makeDb>;
const readJson = (r: Response) => r.json();

/* ─── import routes ─── */
import { POST as createIssue } from "@/pages/api/repos/[owner]/[repo]/issues/index";
import {
  POST as createRelease,
  GET as listReleases,
} from "@/pages/api/repos/[owner]/[repo]/releases/index";

/* ─── Issue tests ─── */
describe("POST /api/repos/[owner]/[repo]/issues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns 201 when issue created", async () => {
    const res = await createIssue({
      request: new Request("http://localhost/api/repos/owner/my-repo/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Bug report",
          body: "Something is broken",
        }),
      }),
      params: { owner: "owner", repo: "my-repo" },
    } as any);
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.title).toBe("Bug report");
    expect(json.number).toBe(6);
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await createIssue({
      request: new Request("http://localhost/api/repos/owner/my-repo/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Bug" }),
      }),
      params: { owner: "owner", repo: "my-repo" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 404 when owner not found", async () => {
    mockDb.query.users.findFirst.mockResolvedValue(null);
    const res = await createIssue({
      request: new Request("http://localhost/api/repos/no-one/my-repo/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Bug" }),
      }),
      params: { owner: "no-one", repo: "my-repo" },
    } as any);
    expect(res.status).toBe(404);
  });

  it("returns 404 when repo not found", async () => {
    mockDb.query.repositories.findFirst.mockResolvedValue(null);
    const res = await createIssue({
      request: new Request("http://localhost/api/repos/owner/no-repo/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Bug" }),
      }),
      params: { owner: "owner", repo: "no-repo" },
    } as any);
    expect(res.status).toBe(404);
  });

  it("returns 404 when user has no read permission", async () => {
    mocks.canReadRepoMock.mockResolvedValue(false);
    const res = await createIssue({
      request: new Request("http://localhost/api/repos/owner/my-repo/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Bug" }),
      }),
      params: { owner: "owner", repo: "my-repo" },
    } as any);
    expect(res.status).toBe(404);
  });
});

/* ─── Release tests ─── */
describe("GET /api/repos/[owner]/[repo]/releases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns 200 with releases list", async () => {
    const res = await listReleases({
      params: { owner: "owner", repo: "my-repo" },
      request: new Request("http://localhost/api/repos/owner/my-repo/releases"),
    } as any);
    expect(res.status).toBe(200);
  });

  it("filters drafts for non-writers", async () => {
    mocks.canWriteRepoMock.mockResolvedValue(false);
    const res = await listReleases({
      params: { owner: "owner", repo: "my-repo" },
      request: new Request("http://localhost/api/repos/owner/my-repo/releases"),
    } as any);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const drafts = json.filter((r: any) => r.isDraft);
    expect(drafts.length).toBe(0);
  });

  it("returns 404 when repo not found", async () => {
    mockDb.query.repositories.findFirst.mockResolvedValue(null);
    const res = await listReleases({
      params: { owner: "owner", repo: "no-repo" },
      request: new Request("http://localhost/api/repos/owner/no-repo/releases"),
    } as any);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/repos/[owner]/[repo]/releases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeDb();
  });

  it("returns 200 when release created", async () => {
    const res = await createRelease({
      params: { owner: "owner", repo: "my-repo" },
      request: new Request(
        "http://localhost/api/repos/owner/my-repo/releases",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagName: "v1.0", name: "Release 1.0" }),
        },
      ),
    } as any);
    expect(res.status).toBe(200);
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await createRelease({
      params: { owner: "owner", repo: "my-repo" },
      request: new Request(
        "http://localhost/api/repos/owner/my-repo/releases",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagName: "v1.0", name: "Release 1.0" }),
        },
      ),
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot write", async () => {
    mocks.canWriteRepoMock.mockResolvedValue(false);
    const res = await createRelease({
      params: { owner: "owner", repo: "my-repo" },
      request: new Request(
        "http://localhost/api/repos/owner/my-repo/releases",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagName: "v1.0", name: "Release 1.0" }),
        },
      ),
    } as any);
    expect(res.status).toBe(403);
  });
});
