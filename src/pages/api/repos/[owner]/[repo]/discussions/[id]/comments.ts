import { getDatabase } from "@/db";
import { discussionComments, discussions } from "@/db/schema/discussions";
import { repositories } from "@/db/schema/repositories";
import { users } from "@/db/schema/users";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  badRequest,
  created,
  getPagination,
  notFound,
  paginationMeta,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";
import type { APIRoute } from "astro";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

export const createCommentSchema = z.object({
  body: z.string().min(1).max(65535),
  parentId: z.string().optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner: ownerName, repo: repoName, id } = params;
  const db = getDatabase() as unknown as NodePgDatabase;

  // 1. Resolve owner & repository & discussion
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, ownerName!))
    .limit(1);

  if (!owner) return notFound("Owner not found");

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName!)),
    )
    .limit(1);

  if (!repo) return notFound("Repository not found");

  // Read permission (anonymous OK for public repos)
  const tokenPayload = await getUserFromRequest(request);
  const hasAccess = await canReadRepo(tokenPayload?.userId, repo as any);
  if (!hasAccess) return notFound("Repository not found");

  const [discussion] = await db
    .select()
    .from(discussions)
    .where(
      and(
        eq(discussions.id, id!),
        eq(discussions.repositoryId, repo.id),
      ),
    )
    .limit(1);

  if (!discussion) return notFound("Discussion not found");

  // 2. Paginated comments (oldest first, thread order)
  const pagination = getPagination(new URL(request.url));

  const comments = await db
    .select({
      id: discussionComments.id,
      parentId: discussionComments.parentId,
      body: discussionComments.body,
      createdAt: discussionComments.createdAt,
      updatedAt: discussionComments.updatedAt,
      author: {
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(discussionComments)
    .innerJoin(users, eq(discussionComments.authorId, users.id))
    .where(eq(discussionComments.discussionId, discussion.id))
    .orderBy(discussionComments.createdAt)
    .limit(pagination.perPage)
    .offset(pagination.offset);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(discussionComments)
    .where(eq(discussionComments.discussionId, discussion.id));

  return success(comments, paginationMeta(countRow?.total ?? 0, pagination));
});

export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner: ownerName, repo: repoName, id } = params;

  // 1. Authenticate
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized("You must be logged in to comment");
  }
  const userId = tokenPayload.userId;

  // 2. Parse body
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const result = createCommentSchema.safeParse(raw);
  if (!result.success) {
    return badRequest("Invalid input", result.error.flatten());
  }
  const { body, parentId } = result.data;

  const db = getDatabase() as unknown as NodePgDatabase;

  // 3. Resolve repository & discussion
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, ownerName!))
    .limit(1);

  if (!owner) return notFound("Owner not found");

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName!)),
    )
    .limit(1);

  if (!repo) return notFound("Repository not found");

  // GitHub model: anyone who can read the repository can comment
  const hasPermission = await canReadRepo(userId, repo as any);
  if (!hasPermission) return notFound("Repository not found");

  const [discussion] = await db
    .select()
    .from(discussions)
    .where(
      and(
        eq(discussions.id, id!),
        eq(discussions.repositoryId, repo.id),
      ),
    )
    .limit(1);

  if (!discussion) return notFound("Discussion not found");

  // 4. Validate parent comment belongs to this discussion (one-level threading)
  if (parentId) {
    const [parent] = await db
      .select({ id: discussionComments.id, parentId: discussionComments.parentId })
      .from(discussionComments)
      .where(
        and(
          eq(discussionComments.id, parentId),
          eq(discussionComments.discussionId, discussion.id),
        ),
      )
      .limit(1);

    if (!parent) {
      return badRequest("Parent comment not found on this discussion");
    }
    if (parent.parentId) {
      return badRequest("Replies beyond one level are not supported");
    }
  }

  // 5. Insert comment + update counters atomically
  const commentId = generateId("dcomment");
  const createdAt = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(discussionComments).values({
      id: commentId,
      discussionId: discussion.id,
      parentId: parentId ?? null,
      authorId: userId,
      body,
      createdAt,
      updatedAt: createdAt,
    });

    await tx
      .update(discussions)
      .set({
        commentCount: sql`${discussions.commentCount} + 1`,
        lastActivityAt: createdAt,
        updatedAt: createdAt,
      } as any)
      .where(eq(discussions.id, discussion.id));
  });

  return created({
    id: commentId,
    discussionId: discussion.id,
    parentId: parentId ?? null,
    authorId: userId,
    body,
    createdAt,
    updatedAt: createdAt,
    author: { id: userId, username: tokenPayload.username },
  });
});
