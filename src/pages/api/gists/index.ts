/**
 * Gists API
 * GET  /api/gists  — list caller's gists (?public=true limits to public ones, ?q= substring search)
 * POST /api/gists  — create a gist (auth required)
 */

import { getDatabase } from "@/db";
import { gists, type GistFile } from "@/db/schema/gists";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  badRequest,
  created,
  getPagination,
  paginationMeta,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils";
import type { APIRoute } from "astro";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

/** Max total content size across all files in a gist: 1MB */
export const MAX_TOTAL_CONTENT_BYTES = 1024 * 1024;
export const MAX_FILES = 10;

const FILENAME_INVALID_CHARS = /[/\\]|\.\./;

export const gistFileSchema = z
  .object({
    filename: z
      .string()
      .min(1, "filename is required")
      .max(255, "filename must be at most 255 characters")
      .refine((v) => !FILENAME_INVALID_CHARS.test(v), {
        message: "filename must not contain path separators or '..'",
      }),
    content: z.string(),
  })
  .refine(
    (f) => f.filename !== "." && f.filename !== "..",
    { message: "filename must not be '.' or '..'" },
  );

export const gistFilesSchema = z
  .array(gistFileSchema)
  .min(1, "at least one file is required")
  .max(MAX_FILES);

export const createGistSchema = z
  .object({
    description: z.string().max(500).optional().default(""),
    public: z.boolean().optional().default(false),
    files: gistFilesSchema,
  })
  .refine(
    (g) =>
      g.files.reduce((sum, f) => sum + Buffer.byteLength(f.content, "utf8"), 0) <=
      MAX_TOTAL_CONTENT_BYTES,
    { message: "total content size exceeds 1MB" },
  );

export const listGistsQuerySchema = z.object({
  public: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  q: z.string().max(255).optional(),
});

function totalContentBytes(files: GistFile[]): number {
  return files.reduce((sum, f) => sum + Buffer.byteLength(f.content, "utf8"), 0);
}

export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized("You must be logged in to list your gists");
  }

  const url = new URL(request.url);
  const query = listGistsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) {
    return badRequest("Invalid query parameters", query.error.flatten());
  }
  const { public: publicOnly, q } = query.data;
  const pagination = getPagination(url);

  const db = getDatabase() as unknown as NodePgDatabase;

  const conditions = [eq(gists.userId, tokenPayload.userId)];
  if (publicOnly) conditions.push(eq(gists.public, true));
  if (q && q.length > 0) {
    conditions.push(
      or(
        ilike(gists.description, `%${q}%`),
        sql`CAST(${gists.files} AS TEXT) ILIKE ${`%${q}%`}`,
      )!,
    );
  }

  const rows = await db
    .select()
    .from(gists)
    .where(and(...conditions))
    .orderBy(desc(gists.updatedAt))
    .limit(pagination.perPage)
    .offset(pagination.offset);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(gists)
    .where(and(...conditions));

  return success(
    rows.map((row) => ({
      ...row,
      fileCount: row.files.length,
      totalBytes: totalContentBytes(row.files),
    })),
    paginationMeta(countRow?.total ?? 0, pagination),
  );
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized("You must be logged in to create a gist");
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const result = createGistSchema.safeParse(raw);
  if (!result.success) {
    return badRequest("Invalid input", result.error.flatten());
  }
  const { description, public: isPublic, files } = result.data;

  const db = getDatabase() as unknown as NodePgDatabase;

  const now = new Date();
  const newGist = {
    id: generateId("gist"),
    userId: tokenPayload.userId,
    description,
    public: isPublic,
    files,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(gists).values(newGist);

  logger.info(
    { userId: tokenPayload.userId, gistId: newGist.id },
    "Gist created",
  );

  return created({
    ...newGist,
    fileCount: files.length,
    totalBytes: totalContentBytes(files),
  });
});
