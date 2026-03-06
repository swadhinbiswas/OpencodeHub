/**
 * Releases API - Get, update, delete single release
 */
import { getDatabase, schema } from "@/db";
import {
  badRequest,
  forbidden,
  noContent,
  notFound,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const updateReleaseSchema = z.object({
  name: z.string().min(1).optional(),
  body: z.string().optional(),
  isDraft: z.boolean().optional(),
  isPrerelease: z.boolean().optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo, id } = params;
  if (!owner || !repo || !id) return badRequest("Missing parameters");

  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("User not found");

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repoData) return notFound("Repository not found");

  const hasAccess = await canReadRepo(tokenPayload?.userId, repoData);
  if (!hasAccess) return notFound("Repository not found");

  const release = await db.query.releases?.findFirst?.({
    where: and(
      eq(schema.releases.id, id),
      eq(schema.releases.repositoryId, repoData.id),
    ),
  });
  if (!release) return notFound("Release not found");

  // Draft releases only visible to writers
  if (release.isDraft) {
    const canWrite = tokenPayload?.userId
      ? await canWriteRepo(tokenPayload.userId, repoData)
      : false;
    if (!canWrite) return notFound("Release not found");
  }

  return success(release);
});

export const PATCH: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo, id } = params;
  if (!owner || !repo || !id) return badRequest("Missing parameters");

  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) return unauthorized("Authentication required");

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("User not found");

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repoData) return notFound("Repository not found");

  const canWrite = await canWriteRepo(tokenPayload.userId, repoData);
  if (!canWrite) return forbidden("Write access required");

  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = updateReleaseSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const updates: any = { ...parsed.data, updatedAt: new Date() };

  // If transitioning from draft to published
  if (parsed.data.isDraft === false) {
    const existingRelease = await db.query.releases?.findFirst?.({
      where: eq(schema.releases.id, id),
    });
    if (existingRelease?.isDraft && !existingRelease.publishedAt) {
      updates.publishedAt = new Date();
    }
  }

  await (db as any)
    .update(schema.releases)
    .set(updates)
    .where(
      and(
        eq(schema.releases.id, id),
        eq(schema.releases.repositoryId, repoData.id),
      ),
    );

  const release = await db.query.releases?.findFirst?.({
    where: eq(schema.releases.id, id),
  });

  return success(release);
});

export const DELETE: APIRoute = withErrorHandler(
  async ({ params, request }) => {
    const { owner, repo, id } = params;
    if (!owner || !repo || !id) return badRequest("Missing parameters");

    const db = getDatabase();
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload?.userId) return unauthorized("Authentication required");

    const ownerUser = await db.query.users.findFirst({
      where: eq(schema.users.username, owner),
    });
    if (!ownerUser) return notFound("User not found");

    const repoData = await db.query.repositories.findFirst({
      where: and(
        eq(schema.repositories.ownerId, ownerUser.id),
        eq(schema.repositories.name, repo),
      ),
    });
    if (!repoData) return notFound("Repository not found");

    const canWrite = await canWriteRepo(tokenPayload.userId, repoData);
    if (!canWrite) return forbidden("Write access required");

    await (db as any)
      .delete(schema.releases)
      .where(
        and(
          eq(schema.releases.id, id),
          eq(schema.releases.repositoryId, repoData.id),
        ),
      );

    return noContent();
  },
);
