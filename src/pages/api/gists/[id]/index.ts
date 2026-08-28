/**
 * Single Gist API
 * GET    /api/gists/[id] — fetch gist (owner or public/secret visibility)
 * PATCH  /api/gists/[id] — owner only; wholesale replace description/files/public
 * DELETE /api/gists/[id] — owner only
 */

import { getDatabase, schema } from "@/db";
import { gists } from "@/db/schema/gists";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { badRequest, noContent, notFound, forbidden, success, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createGistSchema, gistFilesSchema } from "../index";

export const updateGistSchema = z.object({
  description: z.string().max(500).optional(),
  public: z.boolean().optional(),
  files: gistFilesSchema.optional(),
});

async function findGist(db: NodePgDatabase<typeof schema>, id: string) {
  return db.query.gists.findFirst({
    where: eq(gists.id, id),
  });
}

export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
  const tokenPayload = await getUserFromRequest(request);
  const db = getDatabase() as unknown as NodePgDatabase<typeof schema>;

  const gist = await findGist(db, params.id!);
  if (!gist) return notFound("Gist not found");

  // Secret gists are only visible to their owner
  if (!gist.public && gist.userId !== tokenPayload?.userId) {
    return notFound("Gist not found");
  }

  return success({
    ...gist,
    isOwner: gist.userId === tokenPayload?.userId,
  });
});

export const PATCH: APIRoute = withErrorHandler(async ({ request, params }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized("You must be logged in to edit a gist");
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const result = updateGistSchema.safeParse(raw);
  if (!result.success) {
    return badRequest("Invalid input", result.error.flatten());
  }

  const db = getDatabase() as unknown as NodePgDatabase<typeof schema>;

  const gist = await findGist(db, params.id!);
  if (!gist) return notFound("Gist not found");
  if (gist.userId !== tokenPayload.userId) {
    return forbidden("You do not have permission to edit this gist");
  }

  const updates: Partial<typeof gists.$inferInsert> = { updatedAt: new Date() };
  if (result.data.description !== undefined) {
    updates.description = result.data.description;
  }
  if (result.data.public !== undefined) {
    updates.public = result.data.public;
  }
  if (result.data.files !== undefined) {
    updates.files = result.data.files;
  }

  await db.update(gists).set(updates).where(eq(gists.id, gist.id));

  logger.info({ userId: tokenPayload.userId, gistId: gist.id }, "Gist updated");

  return success({ ...gist, ...updates });
});

export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized("You must be logged in to delete a gist");
  }

  const db = getDatabase() as unknown as NodePgDatabase<typeof schema>;

  const gist = await findGist(db, params.id!);
  if (!gist) return notFound("Gist not found");
  if (gist.userId !== tokenPayload.userId) {
    return forbidden("You do not have permission to delete this gist");
  }

  await db.delete(gists).where(eq(gists.id, gist.id));

  logger.info({ userId: tokenPayload.userId, gistId: gist.id }, "Gist deleted");

  return noContent();
});
