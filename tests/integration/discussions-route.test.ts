/**
 * Integration tests for Discussions routes:
 *   GET/POST /api/repos/[owner]/[repo]/discussions
 *   GET/PATCH/DELETE /api/repos/[owner]/[repo]/discussions/[id]
 *   GET/POST /api/repos/[owner]/[repo]/discussions/[id]/comments
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
  canWriteRepoMock: vi.fn().mockResolvedValue(false),
  canAdminRepoMock: vi.fn().mockResolvedValue(false),
  generateIdMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: mocks.getUserFromRequestMock,
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: mocks.canReadRepoMock,
  canWriteRepo: mocks.canWriteRepoMock,
  canAdminRepo: mocks.canAdminRepoMock,
}));

vi.mock("@/lib/errors", () => ({
  withErrorHandler: (fn: any) => fn,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/utils", () => ({
  generateId: mocks.generateIdMock,
  now: () => new Date().toISOString(),
}));

/* ─── fixtures ─── */
import { discussions, discussionComments } from "@/db/schema/discussions";
import { users } from "@/db/schema/users";
import { repositories } from "@/db/schema/repositories";

const ownerRow = { id: "usr_owner", username: "owner", avatarUrl: null };
const repoRow = {
  id: "repo_1",
  name: "my-repo",
  ownerId: "usr_owner",
  visibility: "public",
};

const discussionRow = {
  id: "discussion_1",
  repositoryId: "repo_1",
  authorId: "usr_1",
  title: "Hello world",
  body: "First discussion",
  category: "General",
  pinned: false,
  closed: false,
  commentCount: 0,
  lastActivityAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

/* ─── fake db ─── */
function thenable(result: unknown) {
  const p = Promise.resolve(result);
  const step = () => api;
  const api: any = {
    where: step,
    orderBy: step,
    limit: step,
    offset: step,
    innerJoin: step,
    leftJoin: step,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  return api;
}

function makeDb(
  opts: {
    users?: any[];
    repositories?: any[];
    discussions?: any[];
    comments?: any[];
  } = {},
) {
  const rowsByTable = new Map<any, any[]>([
    [users, opts.users ?? [ownerRow]],
    [repositories, opts.repositories ?? [repoRow]],
    [discussions, opts.discussions ?? [discussionRow]],
    [discussionComments, opts.comments ?? []],
  ]);

  // Count queries project a single { total } field — resolve a count row
  const select = vi.fn((fields?: any) => {
    const isCount =
      fields &&
      typeof fields === "object" &&
      Object.keys(fields).length === 1 &&
      "total" in fields;
    return {
      from: (table: any) =>
        thenable(
          isCount
            ? [{ total: (rowsByTable.get(table) ?? []).length }]
            : (rowsByTable.get(table) ?? []),
        ),
    };
  });

  const insertValues = vi.fn().mockResolvedValue([]);
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateSet = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  });
  const update = vi.fn(() => ({ set: updateSet }));

  const deleteWhere = vi.fn().mockResolvedValue([]);
  const del = vi.fn(() => ({ where: deleteWhere }));

  // Transactions execute inline against dedicated mock writers
  const txSet = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  });
  const txUpdate = vi.fn(() => ({ set: txSet }));
  const transaction = vi.fn(async (cb: any) =>
    cb({ insert, update: txUpdate }),
  );

  return {
    select,
    insert,
    insertValues,
    update,
    updateSet,
    delete: del,
    deleteWhere,
    transaction,
    txSet,
  };
}

let mockDb: ReturnType<typeof makeDb>;
const readJson = (r: Response) => r.json();

/* ─── import routes ─── */
import {
  GET as listDiscussions,
  POST as createDiscussion,
} from "@/pages/api/repos/[owner]/[repo]/discussions/index";
import {
  DELETE as deleteDiscussion,
  GET as getDiscussion,
  PATCH as patchDiscussion,
} from "@/pages/api/repos/[owner]/[repo]/discussions/[id]/index";
import { POST as createComment } from "@/pages/api/repos/[owner]/[repo]/discussions/[id]/comments";

const baseCtx = (request: Request, params: Record<string, string> = {}) => ({
  params: {
    owner: "owner",
    repo: "my-repo",
    id: "discussion_1",
    ...params,
  },
  request,
});

const jsonRequest = (body: unknown, method = "POST") =>
  new Request(
    "http://localhost/api/repos/owner/my-repo/discussions/discussion_1",
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockDb = makeDb();
  mocks.generateIdMock.mockImplementation(
    (prefix?: string) => `${prefix ?? "id"}_new`,
  );
  mocks.getUserFromRequestMock.mockResolvedValue({
    userId: "usr_1",
    username: "alice",
    email: "alice@example.com",
  });
  mocks.canReadRepoMock.mockResolvedValue(true);
  mocks.canWriteRepoMock.mockResolvedValue(false);
  mocks.canAdminRepoMock.mockResolvedValue(false);
});

/* ─── POST /discussions (create) ─── */
describe("POST /api/repos/[owner]/[repo]/discussions", () => {
  it("returns 201 and creates a discussion with default category", async () => {
    const res = await createDiscussion(
      baseCtx(
        new Request("http://localhost/api/repos/owner/my-repo/discussions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Hi", body: "Content" }),
        }),
      ) as any,
    );
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.data.title).toBe("Hi");
    expect(json.data.id).toBe("discussion_new");
    expect(json.data.category).toBe("General");
    expect(mocks.canReadRepoMock).toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await createDiscussion(
      baseCtx(jsonRequest({ title: "Hi", body: "Content" })) as any,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when user has no read permission (GitHub model)", async () => {
    mocks.canReadRepoMock.mockResolvedValue(false);
    const res = await createDiscussion(
      baseCtx(jsonRequest({ title: "Hi", body: "Content" })) as any,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid category or missing title", async () => {
    const badCategory = await createDiscussion(
      baseCtx(
        jsonRequest({ title: "Hi", body: "Content", category: "Memes" }),
      ) as any,
    );
    expect(badCategory.status).toBe(400);

    const noTitle = await createDiscussion(
      baseCtx(jsonRequest({ body: "Content" })) as any,
    );
    expect(noTitle.status).toBe(400);
  });

  it("returns 404 when repository does not exist", async () => {
    mockDb = makeDb({ repositories: [] });
    const res = await createDiscussion(
      baseCtx(jsonRequest({ title: "Hi", body: "Content" })) as any,
    );
    expect(res.status).toBe(404);
  });
});

/* ─── GET /discussions (list) ─── */
describe("GET /api/repos/[owner]/[repo]/discussions", () => {
  it("returns 200 with discussions and pagination meta", async () => {
    const res = await listDiscussions(
      baseCtx(
        new Request("http://localhost/api/repos/owner/my-repo/discussions"),
      ) as any,
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBe(1);
    expect(json.meta.total).toBe(1);
  });

  it("allows anonymous listing of public repos", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await listDiscussions(
      baseCtx(
        new Request("http://localhost/api/repos/owner/my-repo/discussions"),
      ) as any,
    );
    expect(res.status).toBe(200);
  });

  it("hides the repo from anonymous users without read access", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    mocks.canReadRepoMock.mockResolvedValue(false);
    const res = await listDiscussions(
      baseCtx(
        new Request("http://localhost/api/repos/owner/my-repo/discussions"),
      ) as any,
    );
    expect(res.status).toBe(404);
  });

  it("rejects invalid filters with 400", async () => {
    const res = await listDiscussions(
      baseCtx(
        new Request(
          "http://localhost/api/repos/owner/my-repo/discussions?closed=maybe",
        ),
      ) as any,
    );
    expect(res.status).toBe(400);
  });
});

/* ─── GET /discussions/[id] ─── */
describe("GET /api/repos/[owner]/[repo]/discussions/[id]", () => {
  it("returns 200 with discussion, author and comments", async () => {
    const res = await getDiscussion(
      baseCtx(
        new Request(
          "http://localhost/api/repos/owner/my-repo/discussions/discussion_1",
        ),
      ) as any,
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.id).toBe("discussion_1");
    expect(json.data.author.username).toBeDefined();
    expect(Array.isArray(json.data.comments)).toBe(true);
  });
});

/* ─── PATCH /discussions/[id] — permission matrix ─── */
describe("PATCH /api/repos/[owner]/[repo]/discussions/[id]", () => {
  it("author can edit even without repo write access", async () => {
    const res = await patchDiscussion(
      baseCtx(jsonRequest({ title: "Updated" }, "PATCH")) as any,
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.title).toBe("Hello world"); // re-select resolves fixture
    expect(mockDb.updateSet).toHaveBeenCalled();
  });

  it("non-author without write access gets 403", async () => {
    mockDb = makeDb({
      discussions: [{ ...discussionRow, authorId: "usr_other" }],
    });
    const res = await patchDiscussion(
      baseCtx(jsonRequest({ title: "Hacked" }, "PATCH")) as any,
    );
    expect(res.status).toBe(403);
  });

  it("non-author with repo write access can edit (close)", async () => {
    mocks.canWriteRepoMock.mockResolvedValue(true);
    const db = makeDb({
      discussions: [{ ...discussionRow, authorId: "usr_other" }],
    });
    mockDb = db;
    const res = await patchDiscussion(
      baseCtx(jsonRequest({ closed: true }, "PATCH")) as any,
    );
    expect(res.status).toBe(200);
    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ closed: true }),
    );
  });

  it("supports pin/unpin via booleans", async () => {
    const res = await patchDiscussion(
      baseCtx(jsonRequest({ pinned: true }, "PATCH")) as any,
    );
    expect(res.status).toBe(200);
    expect(mockDb.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ pinned: true }),
    );
  });

  it("returns 400 for invalid payloads", async () => {
    const res = await patchDiscussion(
      baseCtx(jsonRequest({ closed: "yes" }, "PATCH")) as any,
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await patchDiscussion(
      baseCtx(jsonRequest({ closed: true }, "PATCH")) as any,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when discussion is missing", async () => {
    mockDb = makeDb({ discussions: [] });
    const res = await patchDiscussion(
      baseCtx(jsonRequest({ closed: true }, "PATCH")) as any,
    );
    expect(res.status).toBe(404);
  });
});

/* ─── DELETE /discussions/[id] — permission matrix ─── */
describe("DELETE /api/repos/[owner]/[repo]/discussions/[id]", () => {
  it("author can delete even without admin rights", async () => {
    const res = await deleteDiscussion(
      baseCtx(
        new Request(
          "http://localhost/api/repos/owner/my-repo/discussions/discussion_1",
          { method: "DELETE" },
        ),
      ) as any,
    );
    expect(res.status).toBe(204);
  });

  it("non-author without admin rights gets 403", async () => {
    mocks.canAdminRepoMock.mockResolvedValue(false);
    mockDb = makeDb({
      discussions: [{ ...discussionRow, authorId: "usr_other" }],
    });
    const res = await deleteDiscussion(
      baseCtx(
        new Request(
          "http://localhost/api/repos/owner/my-repo/discussions/discussion_1",
          { method: "DELETE" },
        ),
      ) as any,
    );
    expect(res.status).toBe(403);
  });

  it("repo admin can delete someone else's discussion", async () => {
    mocks.canAdminRepoMock.mockResolvedValue(true);
    mockDb = makeDb({
      discussions: [{ ...discussionRow, authorId: "usr_other" }],
    });
    const res = await deleteDiscussion(
      baseCtx(
        new Request(
          "http://localhost/api/repos/owner/my-repo/discussions/discussion_1",
          { method: "DELETE" },
        ),
      ) as any,
    );
    expect(res.status).toBe(204);
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await deleteDiscussion(
      baseCtx(
        new Request(
          "http://localhost/api/repos/owner/my-repo/discussions/discussion_1",
          { method: "DELETE" },
        ),
      ) as any,
    );
    expect(res.status).toBe(401);
  });
});

/* ─── POST /discussions/[id]/comments ─── */
describe("POST /api/repos/[owner]/[repo]/discussions/[id]/comments", () => {
  it("returns 201 and updates counters transactionally", async () => {
    const res = await createComment(
      baseCtx(
        jsonRequest({ body: "A thoughtful reply" }),
        { id: "discussion_1" },
      ) as any,
    );

    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.data.id).toBe("dcomment_new");
    expect(json.data.body).toBe("A thoughtful reply");

    // insert + counter update happen inside a single transaction
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        discussionId: "discussion_1",
        authorId: "usr_1",
      }),
    );
    expect(mockDb.txSet).toHaveBeenCalledTimes(1);
    const setArg = mockDb.txSet.mock.calls[0][0];
    expect(setArg.commentCount).toBeDefined(); // sql`comment_count + 1`
    expect(setArg.lastActivityAt).toBeInstanceOf(Date);
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await createComment(
      baseCtx(jsonRequest({ body: "hi" }), { id: "discussion_1" }) as any,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 without read permission on the repository", async () => {
    mocks.canReadRepoMock.mockResolvedValue(false);
    const res = await createComment(
      baseCtx(jsonRequest({ body: "hi" }), { id: "discussion_1" }) as any,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when discussion does not exist in this repo", async () => {
    mockDb = makeDb({ discussions: [] });
    const res = await createComment(
      baseCtx(jsonRequest({ body: "hi" }), { id: "missing" }) as any,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for empty comment bodies", async () => {
    const res = await createComment(
      baseCtx(jsonRequest({ body: "" }), { id: "discussion_1" }) as any,
    );
    expect(res.status).toBe(400);
  });
});

