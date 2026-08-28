/**
 * Unit tests for Gists schema + zod validation schemas
 */
import { describe, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { gists } from "@/db/schema/gists";

/* Route modules pull infra deps at import time — stub them */
vi.mock("@/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@/lib/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/errors", () => ({ withErrorHandler: (fn: any) => fn }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/utils", () => ({
  generateId: (prefix?: string) => `${prefix ?? "id"}_test`,
}));

import {
  createGistSchema,
  gistFileSchema,
  listGistsQuerySchema,
  MAX_FILES,
  MAX_TOTAL_CONTENT_BYTES,
} from "@/pages/api/gists/index";
import { updateGistSchema } from "@/pages/api/gists/[id]/index";

function columnMap(table: any) {
  const { columns } = getTableConfig(table);
  return new Map(columns.map((c: any) => [c.name, c]));
}

describe("gists schema", () => {
  it("defines the gists table with expected columns", () => {
    const config = getTableConfig(gists);
    expect(config.name).toBe("gists");

    const cols = columnMap(gists);
    for (const name of [
      "id",
      "user_id",
      "description",
      "public",
      "files",
      "created_at",
      "updated_at",
    ]) {
      expect(cols.has(name)).toBe(true);
    }
  });

  it("uses a text primary key and requires core fields", () => {
    const cols = columnMap(gists);
    expect(cols.get("id")!.dataType).toBe("string");
    expect(cols.get("user_id")!.notNull).toBe(true);
    expect(cols.get("files")!.notNull).toBe(true);
    expect(cols.get("public")!.notNull).toBe(true);
  });

  it("defaults description to empty string and public to false", () => {
    const cols = columnMap(gists);
    expect(cols.get("description")!.hasDefault).toBe(true);
    expect(cols.get("public")!.hasDefault).toBe(true);
  });

  it("declares user+updatedAt and public indexes", () => {
    const { indexes } = getTableConfig(gists);
    const names = indexes.map((i: any) => i.config.name);
    expect(names).toContain("gists_user_updated_idx");
    expect(names).toContain("gists_public_idx");
  });

  it("references users with cascade delete", () => {
    const config = getTableConfig(gists);
    expect(config.foreignKeys).toHaveLength(1);
  });
});

describe("gistFileSchema filename validation", () => {
  it("accepts simple filenames with extensions", () => {
    const ok = gistFileSchema.safeParse({
      filename: "hello.py",
      content: "print('hi')",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects empty filenames", () => {
    const res = gistFileSchema.safeParse({ filename: "", content: "x" });
    expect(res.success).toBe(false);
  });

  it("rejects filenames longer than 255 chars", () => {
    const res = gistFileSchema.safeParse({
      filename: "a".repeat(256),
      content: "x",
    });
    expect(res.success).toBe(false);
  });

  it("rejects path separators '/' in filenames", () => {
    const res = gistFileSchema.safeParse({
      filename: "a/b.txt",
      content: "x",
    });
    expect(res.success).toBe(false);
  });

  it("rejects backslash separators in filenames", () => {
    const res = gistFileSchema.safeParse({
      filename: "a\\b.txt",
      content: "x",
    });
    expect(res.success).toBe(false);
  });

  it("rejects traversal like '../secret'", () => {
    const res = gistFileSchema.safeParse({ filename: "../secret", content: "x" });
    expect(res.success).toBe(false);
  });

  it("rejects bare '..' and '.' filenames", () => {
    expect(gistFileSchema.safeParse({ filename: "..", content: "x" }).success).toBe(
      false,
    );
    expect(gistFileSchema.safeParse({ filename: ".", content: "x" }).success).toBe(
      false,
    );
  });

  it("rejects embedded '..' segments like 'a..b.txt'", () => {
    // '..' anywhere is treated as traversal-prone and rejected
    const res = gistFileSchema.safeParse({ filename: "a..b.txt", content: "x" });
    expect(res.success).toBe(false);
  });
});

describe("createGistSchema", () => {
  const validFile = { filename: "a.txt", content: "hello" };

  it("accepts a minimal valid payload", () => {
    const res = createGistSchema.safeParse({
      description: "my snippet",
      public: true,
      files: [validFile],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.public).toBe(true);
      expect(res.data.description).toBe("my snippet");
    }
  });

  it("defaults description to '' and public to false", () => {
    const res = createGistSchema.safeParse({ files: [validFile] });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.description).toBe("");
      expect(res.data.public).toBe(false);
    }
  });

  it("rejects descriptions over 500 chars", () => {
    const res = createGistSchema.safeParse({
      description: "x".repeat(501),
      files: [validFile],
    });
    expect(res.success).toBe(false);
  });

  it("requires at least one file", () => {
    const res = createGistSchema.safeParse({ files: [] });
    expect(res.success).toBe(false);
  });

  it(`allows at most ${MAX_FILES} files`, () => {
    const manyFiles = Array.from({ length: MAX_FILES }, (_, i) => ({
      filename: `f${i}.txt`,
      content: "x",
    }));
    expect(createGistSchema.safeParse({ files: manyFiles }).success).toBe(true);

    const tooMany = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({
      filename: `f${i}.txt`,
      content: "x",
    }));
    expect(createGistSchema.safeParse({ files: tooMany }).success).toBe(false);
  });

  it("enforces the 1MB total content limit across all files", async () => {
    const half = "a".repeat(MAX_TOTAL_CONTENT_BYTES / 2);
    const atLimit = createGistSchema.safeParse({
      files: [
        { filename: "one.txt", content: half },
        { filename: "two.txt", content: half },
      ],
    });
    expect(atLimit.success).toBe(true);

    const overLimit = createGistSchema.safeParse({
      files: [
        { filename: "one.txt", content: half },
        { filename: "two.txt", content: half + "x" },
      ],
    });
    expect(overLimit.success).toBe(false);

    // Multi-byte characters count towards the byte budget
    // ("é" is 2 bytes in UTF-8; 525000 chars = 1050000 bytes > 1MiB)
    const multibyteOverLimit = createGistSchema.safeParse({
      files: [{ filename: "u.txt", content: "é".repeat(525000) }],
    }).success;
    expect(multibyteOverLimit).toBe(false);
  });

  it("propagates per-file validation to nested files", () => {
    const res = createGistSchema.safeParse({
      files: [validFile, { filename: "../escape.txt", content: "nope" }],
    });
    expect(res.success).toBe(false);
  });
});

describe("listGistsQuerySchema", () => {
  it("parses public=true into boolean true", () => {
    const res = listGistsQuerySchema.safeParse({ public: "true" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.public).toBe(true);
  });

  it("rejects invalid public values", () => {
    expect(listGistsQuerySchema.safeParse({ public: "yes" }).success).toBe(false);
  });

  it("passes through q search strings", () => {
    const res = listGistsQuerySchema.safeParse({ q: "snippet" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.q).toBe("snippet");
  });

  it("allows an empty query", () => {
    expect(listGistsQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe("updateGistSchema", () => {
  it("accepts partial updates", () => {
    expect(updateGistSchema.safeParse({ description: "new" }).success).toBe(true);
    expect(updateGistSchema.safeParse({ public: true }).success).toBe(true);
    expect(
      updateGistSchema.safeParse({
        files: [{ filename: "n.txt", content: "x" }],
      }).success,
    ).toBe(true);
  });

  it("rejects invalid replacement files", () => {
    expect(updateGistSchema.safeParse({ files: [] }).success).toBe(false);
    expect(
      updateGistSchema.safeParse({ files: [{ filename: "/etc/x", content: "y" }] })
        .success,
    ).toBe(false);
  });

  it("rejects unknown oversized descriptions", () => {
    expect(
      updateGistSchema.safeParse({ description: "x".repeat(501) }).success,
    ).toBe(false);
  });
});
