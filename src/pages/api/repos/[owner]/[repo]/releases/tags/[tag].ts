/**
 * Releases API - Get/delete release by tag name
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

/** Helper: resolve repo + release by tag name */
async function resolveReleaseByTag(
  owner: string,
  repo: string,
  tag: string,
  tokenPayload: any,
) {
  const db = getDatabase();

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return { error: notFound("User not found") };

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repoData) return { error: notFound("Repository not found") };

  const hasAccess = await canReadRepo(tokenPayload?.userId, repoData);
  if (!hasAccess) return { error: notFound("Repository not found") };

  // Look up tag in the tags table
  const tagRecord = await db.query.tags?.findFirst?.({
    where: and(
      eq(schema.tags.repositoryId, repoData.id),
      eq(schema.tags.name, tag),
    ),
  });

  // Find release linked to this tag, or by name match
  let release;
  if (tagRecord) {
    release = await db.query.releases?.findFirst?.({
      where: and(
        eq(schema.releases.repositoryId, repoData.id),
        eq(schema.releases.tagId, tagRecord.id),
      ),
    });
  }

  // Fallback: match release name to tag name
  if (!release) {
    release = await db.query.releases?.findFirst?.({
      where: and(
        eq(schema.releases.repositoryId, repoData.id),
        eq(schema.releases.name, tag),
      ),
    });
  }

  if (!release) return { error: notFound("Release not found for tag") };

  return { db, repoData, release };
}

export const GET: APIRoute = withErrorHandler((async ({
  params,
  request,
}: any) => {
  const { owner, repo, tag } = params;
  if (!owner || !repo || !tag) return badRequest("Missing parameters");

  const tokenPayload = await getUserFromRequest(request);
  const result = await resolveReleaseByTag(owner, repo, tag, tokenPayload);
  if ("error" in result) return result.error;

  const { release, repoData } = result;

  // Draft releases only visible to writers
  if (release.isDraft) {
    const canWrite = tokenPayload?.userId
      ? await canWriteRepo(tokenPayload.userId, repoData)
      : false;
    if (!canWrite) return notFound("Release not found");
  }

  return success(release);
}) as any);

export const DELETE: APIRoute = withErrorHandler((async ({
  params,
  request,
}: any) => {
  const { owner, repo, tag } = params;
  if (!owner || !repo || !tag) return badRequest("Missing parameters");

  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) return unauthorized("Authentication required");

  const result = await resolveReleaseByTag(owner, repo, tag, tokenPayload);
  if ("error" in result) return result.error;

  const { db, release, repoData } = result;

  const canWrite = await canWriteRepo(tokenPayload.userId, repoData);
  if (!canWrite) return forbidden("Write access required");

  await (db as any)
    .delete(schema.releases)
    .where(eq(schema.releases.id, release.id));

  return noContent();
}) as any);
