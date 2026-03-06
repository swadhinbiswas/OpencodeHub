import {
  badRequest,
  conflict,
  created,
  forbidden,
  getPagination,
  noContent,
  notFound,
  paginationMeta,
  parseQuery,
  rateLimited,
  serverError,
  success,
  unauthorized,
  validationError,
} from "@/lib/api";
import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("success", () => {
  it("returns 200 JSON response", async () => {
    const res = success({ name: "test" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("test");
  });

  it("includes meta when provided", async () => {
    const meta = { page: 1, perPage: 10, total: 100 };
    const res = success([1, 2, 3], meta);
    const body = await res.json();
    expect(body.meta).toBeDefined();
    expect(body.meta.page).toBe(1);
  });
});

describe("created", () => {
  it("returns 201 JSON response", async () => {
    const res = created({ id: "abc123" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe("noContent", () => {
  it("returns 204 with no body", () => {
    const res = noContent();
    expect(res.status).toBe(204);
  });
});

describe("error responses", () => {
  it("badRequest returns 400", async () => {
    const res = badRequest("Invalid input");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Invalid input");
  });

  it("unauthorized returns 401", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
  });

  it("unauthorized with custom message", async () => {
    const res = unauthorized("Login required");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Login required");
  });

  it("forbidden returns 403", async () => {
    const res = forbidden();
    expect(res.status).toBe(403);
  });

  it("notFound returns 404", async () => {
    const res = notFound("Repo not found");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Repo not found");
  });

  it("conflict returns 409", async () => {
    const res = conflict("Already exists");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toBe("Already exists");
  });

  it("serverError returns 500", async () => {
    const res = serverError();
    expect(res.status).toBe(500);
  });

  it("rateLimited returns 429", async () => {
    const res = rateLimited(60);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("validationError returns 400 with zod errors", async () => {
    const schema = z.object({ name: z.string().min(1) });
    const result = schema.safeParse({ name: "" });
    if (!result.success) {
      const res = validationError(result.error);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    }
  });
});

describe("parseQuery", () => {
  it("parses valid query parameters", () => {
    const schema = z.object({
      page: z.coerce.number().default(1),
      search: z.string().optional(),
    });
    const url = new URL("http://localhost?page=3&search=hello");
    const result = parseQuery(url, schema);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.page).toBe(3);
      expect(result.data.search).toBe("hello");
    }
  });

  it("returns error for invalid query", () => {
    const schema = z.object({
      page: z.coerce.number().int().min(1),
    });
    const url = new URL("http://localhost?page=-5");
    const result = parseQuery(url, schema);
    expect("error" in result).toBe(true);
  });

  it("uses defaults when query params are missing", () => {
    const schema = z.object({
      page: z.coerce.number().default(1),
      perPage: z.coerce.number().default(20),
    });
    const url = new URL("http://localhost");
    const result = parseQuery(url, schema);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(20);
    }
  });
});

describe("getPagination", () => {
  it("returns default pagination for empty URL", () => {
    const url = new URL("http://localhost");
    const result = getPagination(url);
    expect(result.page).toBe(1);
    expect(result.perPage).toBeGreaterThan(0);
    expect(result.offset).toBe(0);
  });

  it("parses page and perPage from query", () => {
    const url = new URL("http://localhost?page=3&per_page=50");
    const result = getPagination(url);
    expect(result.page).toBe(3);
    expect(result.perPage).toBe(50);
    expect(result.offset).toBe(100);
  });

  it("clamps perPage to max", () => {
    const url = new URL("http://localhost?per_page=9999");
    const result = getPagination(url, 20, 100);
    expect(result.perPage).toBeLessThanOrEqual(100);
  });

  it("defaults to page 1 for invalid page", () => {
    const url = new URL("http://localhost?page=abc");
    const result = getPagination(url);
    expect(result.page).toBe(1);
  });
});

describe("paginationMeta", () => {
  it("calculates correct pagination metadata", () => {
    const pagination = { page: 2, perPage: 10, offset: 10 };
    const meta = paginationMeta(95, pagination);
    expect(meta?.page).toBe(2);
    expect(meta?.perPage).toBe(10);
    expect(meta?.total).toBe(95);
    expect(meta?.totalPages).toBe(10);
  });

  it("handles 0 total items", () => {
    const pagination = { page: 1, perPage: 10, offset: 0 };
    const meta = paginationMeta(0, pagination);
    expect(meta?.total).toBe(0);
    expect(meta?.totalPages).toBe(0);
  });

  it("handles single page", () => {
    const pagination = { page: 1, perPage: 10, offset: 0 };
    const meta = paginationMeta(5, pagination);
    expect(meta?.totalPages).toBe(1);
  });
});
