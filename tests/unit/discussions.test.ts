/**
 * Unit tests for Discussions schema + zod validation schemas
 */
import { describe, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  discussions,
  discussionComments,
  DISCUSSION_CATEGORIES,
} from "@/db/schema/discussions";

/* Route modules pull infra deps at import time — stub them */
vi.mock("@/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@/lib/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  canReadRepo: vi.fn(),
  canWriteRepo: vi.fn(),
  canAdminRepo: vi.fn(),
}));
vi.mock("@/lib/errors", () => ({ withErrorHandler: (fn: any) => fn }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  createDiscussionSchema,
  listDiscussionsQuerySchema,
} from "@/pages/api/repos/[owner]/[repo]/discussions/index";
import { updateDiscussionSchema } from "@/pages/api/repos/[owner]/[repo]/discussions/[id]/index";
import { createCommentSchema } from "@/pages/api/repos/[owner]/[repo]/discussions/[id]/comments";

function columnMap(table: any) {
  const { columns } = getTableConfig(table);
  return new Map(columns.map((c: any) => [c.name, c]));
}

describe("discussions schema", () => {
  it("defines the discussions table with expected columns", () => {
    const config = getTableConfig(discussions);
    expect(config.name).toBe("discussions");

    const cols = columnMap(discussions);
    for (const name of [
      "id",
      "repository_id",
      "author_id",
      "title",
      "body",
      "category",
      "pinned",
      "closed",
      "comment_count",
      "last_activity_at",
      "created_at",
      "updated_at",
    ]) {
      expect(cols.has(name)).toBe(true);
    }
  });

  it("uses text primary keys and required core fields", () => {
    const cols = columnMap(discussions);
    expect(cols.get("id")!.dataType).toBe("string");
    expect(cols.get("title")!.notNull).toBe(true);
    expect(cols.get("body")!.notNull).toBe(true);
    expect(cols.get("repository_id")!.notNull).toBe(true);
    expect(cols.get("author_id")!.notNull).toBe(true);
  });

  it("defaults category to General, flags to false and counters to 0", () => {
    const cols = columnMap(discussions);
    expect(cols.get("category")!.hasDefault).toBe(true);
    expect(cols.get("pinned")!.hasDefault).toBe(true);
    expect(cols.get("closed")!.hasDefault).toBe(true);
    expect(cols.get("comment_count")!.hasDefault).toBe(true);
  });

  it("declares repo+closed and repo+lastActivityAt indexes", () => {
    const { indexes } = getTableConfig(discussions);
    const names = indexes.map((i: any) => i.config.name);
    expect(names).toContain("discussions_repo_closed_idx");
    expect(names).toContain("discussions_repo_activity_idx");
    expect(names).toContain("discussions_author_idx");
  });

  it("defines threaded comments stored flat-ready", () => {
    const config = getTableConfig(discussionComments);
    expect(config.name).toBe("discussion_comments");

    const cols = columnMap(discussionComments);
    expect(cols.get("parent_id")!.notNull).toBe(false);

    const indexNames = config.indexes.map((i: any) => i.config.name);
    expect(indexNames).toContain("discussion_comments_discussion_idx");
    expect(indexNames).toContain("discussion_comments_parent_idx");
  });

  it("exposes the four v1 categories", () => {
    expect([...DISCUSSION_CATEGORIES]).toEqual([
      "General",
      "Ideas",
      "Q&A",
      "Show and tell",
    ]);
  });
});

describe("createDiscussionSchema", () => {
  it("accepts a valid payload and defaults the category", () => {
    const parsed = createDiscussionSchema.parse({
      title: "Hello",
      body: "World",
    });
    expect(parsed.category).toBe("General");
  });

  it("rejects titles beyond 300 characters", () => {
    const result = createDiscussionSchema.safeParse({
      title: "x".repeat(301),
      body: "World",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty titles", () => {
    const result = createDiscussionSchema.safeParse({
      title: "",
      body: "World",
    });
    expect(result.success).toBe(false);
  });

  it("rejects bodies over 64k", () => {
    const result = createDiscussionSchema.safeParse({
      title: "Hello",
      body: "x".repeat(65536),
    });
    expect(result.success).toBe(false);
  });

  it("requires a body", () => {
    const result = createDiscussionSchema.safeParse({ title: "Hello" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown categories", () => {
    const result = createDiscussionSchema.safeParse({
      title: "Hello",
      body: "World",
      category: "Memes",
    });
    expect(result.success).toBe(false);
  });
});

describe("listDiscussionsQuerySchema", () => {
  it("applies default sort", () => {
    expect(listDiscussionsQuerySchema.parse({}).sort).toBe("lastActivity");
  });

  it("parses closed filter strings into booleans", () => {
    expect(listDiscussionsQuerySchema.parse({ closed: "true" }).closed).toBe(
      true,
    );
    expect(listDiscussionsQuerySchema.parse({ closed: "false" }).closed).toBe(
      false,
    );
    expect(listDiscussionsQuerySchema.parse({}).closed).toBeUndefined();
  });

  it("rejects malformed closed filter", () => {
    expect(
      listDiscussionsQuerySchema.safeParse({ closed: "yes" }).success,
    ).toBe(false);
  });

  it("accepts newest sort and known categories", () => {
    const parsed = listDiscussionsQuerySchema.parse({
      sort: "newest",
      category: "Q&A",
    });
    expect(parsed.sort).toBe("newest");
    expect(parsed.category).toBe("Q&A");
  });

  it("rejects unknown sort values", () => {
    expect(
      listDiscussionsQuerySchema.safeParse({ sort: "bogus" }).success,
    ).toBe(false);
  });
});

describe("updateDiscussionSchema", () => {
  it("accepts individual partial fields", () => {
    expect(updateDiscussionSchema.parse({ pinned: true })).toEqual({
      pinned: true,
    });
    expect(updateDiscussionSchema.parse({ closed: true })).toEqual({
      closed: true,
    });
    expect(
      updateDiscussionSchema.parse({ title: "New title", body: "New body" }),
    ).toEqual({ title: "New title", body: "New body" });
    expect(
      updateDiscussionSchema.parse({ category: "Show and tell" }).category,
    ).toBe("Show and tell");
  });

  it("rejects an empty patch", () => {
    expect(updateDiscussionSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-boolean close/pin values", () => {
    expect(updateDiscussionSchema.safeParse({ closed: "yes" }).success).toBe(
      false,
    );
    expect(updateDiscussionSchema.safeParse({ pinned: 1 }).success).toBe(false);
  });

  it("rejects oversized bodies", () => {
    expect(
      updateDiscussionSchema.safeParse({ body: "x".repeat(65536) }).success,
    ).toBe(false);
  });
});

describe("createCommentSchema", () => {
  it("accepts a body and optional parentId", () => {
    expect(createCommentSchema.parse({ body: "hi" }).parentId).toBeUndefined();
    expect(
      createCommentSchema.parse({ body: "hi", parentId: "dcomment_1" })
        .parentId,
    ).toBe("dcomment_1");
  });

  it("rejects empty or oversized bodies", () => {
    expect(createCommentSchema.safeParse({ body: "" }).success).toBe(false);
    expect(
      createCommentSchema.safeParse({ body: "x".repeat(65536) }).success,
    ).toBe(false);
  });
});
