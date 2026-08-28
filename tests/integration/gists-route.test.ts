/**
 * Integration tests for Gists routes:
 *   GET/POST /api/gists
 *   GET/PATCH/DELETE /api/gists/[id]
 *   GET /api/gists/[id]/raw/[file]
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ─── hoisted mocks ─── */
const mocks = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn().mockResolvedValue({
    userId: "usr_1",
    username: "alice",
    email: "alice@example.com",
  }),
  generateIdMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: mocks.getUserFromRequestMock,
}));

vi.mock("@/lib/errors", () => ({
  withErrorHandler: (fn: any) => fn,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/utils", () => ({
  generateId: mocks.generateIdMock,
}));

/* ─── fixtures ─── */
import { gists } from "@/db/schema/gists";

const ownerGist = {
  id: "gist_1",
  userId: "usr_1",
  description: "my secret snippet",
  public: false,
  files: [{ filename: "a.txt", content: "hello world" }],
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
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

function makeDb(opts: { gists?: any[] } = {}) {
  const rowsByTable = new Map<any, any[]>([[gists, opts.gists ?? [ownerGist]]]);

  const state = {
    inserted: null as any,
    updates: [] as any[],
    deletedWhere: null as any,
    /** Result returned by query.gists.findFirst */
    found: ownerGist as any,
  };

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

  const insertValues = vi.fn((values: any) => {
    state.inserted = values;
    return Promise.resolve([]);
  });
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateSet = vi.fn((values: any) => {
    state.updates.push(values);
    return {
      where: vi.fn().mockResolvedValue([]),
    };
  });
  const update = vi.fn(() => ({ set: updateSet }));

  const deleteWhere = vi.fn((where: any) => {
    state.deletedWhere = where;
    return Promise.resolve([]);
  });
  const del = vi.fn(() => ({ where: deleteWhere }));

  const query = {
    gists: {
      findFirst: vi.fn(async () => state.found),
    },
  };

  return {
    select,
    insert,
    insertValues,
    update,
    updateSet,
    delete: del,
    deleteWhere,
    query,
    state,
  };
}

let mockDb: ReturnType<typeof makeDb>;

/* ─── import routes ─── */
import { GET as listGists, POST as createGist } from "@/pages/api/gists/index";
import {
  DELETE as deleteGist,
  GET as getGist,
  PATCH as patchGist,
} from "@/pages/api/gists/[id]/index";
import { GET as getRawFile } from "@/pages/api/gists/[id]/raw/[file]";

const readJson = (r: Response) => r.json();

function listCtx(query = "") {
  const reqUrl = `http://localhost/api/gists${query}`;
  return { request: new Request(reqUrl), url: new URL(reqUrl) } as any;
}

function idCtx(
  request: Request,
  params: Record<string, string> = {},
) {
  return {
    request,
    url: new URL(request.url),
    params: { id: "gist_1", ...params },
  } as any;
}

const gistRequest = (
  body: unknown,
  method = "POST",
  path = "/api/gists",
) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

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
});

/* ─── POST /api/gists (create) ─── */
describe("POST /api/gists", () => {
  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await createGist({
      request: gistRequest({ files: [{ filename: "a.txt", content: "x" }] }),
      url: new URL("http://localhost/api/gists"),
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 201 and creates a gist", async () => {
    const res = await createGist({
      request: gistRequest({
        description: "demo",
        public: true,
        files: [{ filename: "a.txt", content: "hello" }],
      }),
      url: new URL("http://localhost/api/gists"),
    } as any);
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.data.id).toBe("gist_new");
    expect(json.data.description).toBe("demo");
    expect(json.data.public).toBe(true);
    expect(json.data.fileCount).toBe(1);
    expect(mockDb.state.inserted.userId).toBe("usr_1");
    expect(mocks.generateIdMock).toHaveBeenCalledWith("gist");
  });

  it("defaults description to '' and visibility to secret", async () => {
    const res = await createGist({
      request: gistRequest({ files: [{ filename: "a.txt", content: "x" }] }),
      url: new URL("http://localhost/api/gists"),
    } as any);
    const json = await readJson(res);
    expect(json.data.description).toBe("");
    expect(json.data.public).toBe(false);
  });

  it("returns 400 for path-traversal filenames", async () => {
    for (const filename of ["../escape.txt", "/etc/passwd", "a/b.txt"]) {
      const res = await createGist({
        request: gistRequest({ files: [{ filename, content: "x" }] }),
        url: new URL("http://localhost/api/gists"),
      } as any);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error.code).toBe("BAD_REQUEST");
    }
  });

  it("returns 400 when files array is empty or exceeds 10 files", async () => {
    const empty = await createGist({
      request: gistRequest({ files: [] }),
      url: new URL("http://localhost/api/gists"),
    } as any);
    expect(empty.status).toBe(400);

    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      filename: `f${i}.txt`,
      content: "x",
    }));
    const res = await createGist({
      request: gistRequest({ files: tooMany }),
      url: new URL("http://localhost/api/gists"),
    } as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when total content exceeds 1MB", async () => {
    const half = "a".repeat(512 * 1024);
    const res = await createGist({
      request: gistRequest({
        files: [
          { filename: "one.txt", content: half },
          { filename: "two.txt", content: half + "overflow" },
        ],
      }),
      url: new URL("http://localhost/api/gists"),
    } as any);
    expect(res.status).toBe(400);
  });
});

/* ─── GET /api/gists (list) ─── */
describe("GET /api/gists", () => {
  it("returns 401 when not authenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await listGists(listCtx());
    expect(res.status).toBe(401);
  });

  it("returns 200 with pagination meta for authenticated user", async () => {
    const res = await listGists(listCtx());
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data[0].fileCount).toBe(1);
    expect(json.meta.page).toBe(1);
    expect(json.meta.total).toBe(1);
  });
});

/* ─── GET /api/gists/[id] ─── */
describe("GET /api/gists/[id]", () => {
  it("lets the owner read a secret gist", async () => {
    const res = await getGist(idCtx(gistRequest(undefined, "GET")));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.isOwner).toBe(true);
  });

  it("hides secret gists from non-owners (404)", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue({
      userId: "usr_other",
      username: "bob",
    });
    const res = await getGist(idCtx(gistRequest(undefined, "GET")));
    expect(res.status).toBe(404);
  });

  it("serves public gists to anonymous users without isOwner", async () => {
    mockDb.state.found = { ...ownerGist, public: true };
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await getGist(idCtx(gistRequest(undefined, "GET")));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.data.isOwner).toBe(false);
  });

  it("returns 404 for unknown ids", async () => {
    mockDb.state.found = undefined;
    const res = await getGist(idCtx(gistRequest(undefined, "GET")));
    expect(res.status).toBe(404);
  });
});

/* ─── PATCH /api/gists/[id] ─── */
describe("PATCH /api/gists/[id]", () => {
  it("is owner-only: returns 403 for authenticated non-owner", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue({
      userId: "usr_other",
      username: "bob",
    });
    const res = await patchGist(
      idCtx(gistRequest({ description: "hack" }, "PATCH")),
    );
    expect(res.status).toBe(403);
    expect(mockDb.state.updates).toHaveLength(0);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await patchGist(
      idCtx(gistRequest({ description: "x" }, "PATCH")),
    );
    expect(res.status).toBe(401);
  });

  it("replaces description, visibility and files wholesale for the owner", async () => {
    const payload = {
      description: "updated",
      public: true,
      files: [{ filename: "new.txt", content: "new content" }],
    };
    const res = await patchGist(idCtx(gistRequest(payload, "PATCH")));
    expect(res.status).toBe(200);
    const applied = mockDb.state.updates[0];
    expect(applied.description).toBe("updated");
    expect(applied.public).toBe(true);
    expect(applied.files).toEqual(payload.files);
    expect(applied.updatedAt).toBeInstanceOf(Date);
  });

  it("returns 400 for invalid replacement files", async () => {
    const res = await patchGist(
      idCtx(gistRequest({ files: [{ filename: "../x", content: "" }] }, "PATCH")),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when gist does not exist", async () => {
    mockDb.state.found = undefined;
    const res = await patchGist(
      idCtx(gistRequest({ description: "x" }, "PATCH")),
    );
    expect(res.status).toBe(404);
  });
});

/* ─── DELETE /api/gists/[id] ─── */
describe("DELETE /api/gists/[id]", () => {
  it("deletes for the owner and returns 204", async () => {
    const res = await deleteGist(idCtx(new Request("http://localhost/api/gists/gist_1", { method: "DELETE" })));
    expect(res.status).toBe(204);
    expect(mockDb.state.deletedWhere).toBeDefined();
  });

  it("is owner-only: returns 403 for authenticated non-owner", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue({
      userId: "usr_other",
      username: "bob",
    });
    const res = await deleteGist(idCtx(new Request("http://localhost/api/gists/gist_1", { method: "DELETE" })));
    expect(res.status).toBe(403);
    expect(mockDb.state.deletedWhere).toBeNull();
  });

  it("returns 404 for unknown ids", async () => {
    mockDb.state.found = undefined;
    const res = await deleteGist(idCtx(new Request("http://localhost/api/gists/gist_1", { method: "DELETE" })));
    expect(res.status).toBe(404);
  });
});

/* ─── GET /api/gists/[id]/raw/[file] ─── */
describe("GET /api/gists/[id]/raw/[file]", () => {
  const rawCtx = (file: string, params = {}) =>
    idCtx(new Request(`http://localhost/api/gists/gist_1/raw/${file}`), {
      file,
      ...params,
    });

  it("serves file content as text/plain charset=utf-8", async () => {
    const res = await getRawFile(rawCtx("a.txt"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("hello world");
  });

  it("allows anonymous access to public gists", async () => {
    mockDb.state.found = { ...ownerGist, public: true };
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await getRawFile(rawCtx("a.txt"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
  });

  it("requires auth for secret gists (401 anonymous)", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue(null);
    const res = await getRawFile(rawCtx("a.txt"));
    expect(res.status).toBe(401);
  });

  it("hides secret gists from non-owners (404)", async () => {
    mocks.getUserFromRequestMock.mockResolvedValue({
      userId: "usr_other",
      username: "bob",
    });
    const res = await getRawFile(rawCtx("a.txt"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for filenames not present in the gist", async () => {
    const res = await getRawFile(rawCtx("missing.txt"));
    expect(res.status).toBe(404);
  });

  it("decodes URL-encoded filenames", async () => {
    mockDb.state.found = {
      ...ownerGist,
      files: [{ filename: "my file.txt", content: "spaces are ok" }],
    };
    const res = await getRawFile(rawCtx("my%20file.txt"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("spaces are ok");
  });
});
