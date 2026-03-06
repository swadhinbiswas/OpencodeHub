/**
 * Releases API - List and create releases
 */
import { getDatabase, schema } from "@/db";
import {
  badRequest,
  forbidden,
  notFound,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

const createReleaseSchema = z.object({
  tagName: z.string().min(1),
  name: z.string().min(1),
  body: z.string().optional(),
  isDraft: z.boolean().optional().default(false),
  isPrerelease: z.boolean().optional().default(false),
});

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) return badRequest("Owner and repo required");

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

  const releases = await (db as any)
    .select()
    .from(schema.releases)
    .where(eq(schema.releases.repositoryId, repoData.id))
    .orderBy(desc(schema.releases.createdAt));

  // If not authenticated or not writer, filter out drafts
  const canWrite = tokenPayload?.userId
    ? await canWriteRepo(tokenPayload.userId, repoData)
    : false;

  const filtered = canWrite
    ? releases
    : releases.filter((r: any) => !r.isDraft);

  return success(filtered);
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) return badRequest("Owner and repo required");

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
  const parsed = createReleaseSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const {
    tagName,
    name,
    body: releaseBody,
    isDraft,
    isPrerelease,
  } = parsed.data;

  // Find tag if exists
  const tag = await db.query.tags?.findFirst?.({
    where: and(
      eq(schema.tags.repositoryId, repoData.id),
      eq(schema.tags.name, tagName),
    ),
  });

  const releaseId = crypto.randomUUID();
  await (db as any).insert(schema.releases).values({
    id: releaseId,
    repositoryId: repoData.id,
    tagId: tag?.id || null,
    name,
    body: releaseBody || "",
    isDraft,
    isPrerelease,
    authorId: tokenPayload.userId,
    publishedAt: isDraft ? null : new Date(),
  });

  const release = await db.query.releases?.findFirst?.({
    where: eq(schema.releases.id, releaseId),
  });

  return success(release);
});
