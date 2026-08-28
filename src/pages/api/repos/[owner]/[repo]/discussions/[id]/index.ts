import { getDatabase } from "@/db";
import {
  discussionComments,
  discussions,
  DISCUSSION_CATEGORIES,
} from "@/db/schema/discussions";
import { repositories } from "@/db/schema/repositories";
import { users } from "@/db/schema/users";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  badRequest,
  forbidden,
  getPagination,
  noContent,
  notFound,
  paginationMeta,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canAdminRepo, canReadRepo, canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

export const updateDiscussionSchema = z
  .object({
    title: z.string().min(1).max(300),
    body: z.string().min(1).max(65535),
    category: z.enum(DISCUSSION_CATEGORIES),
    closed: z.boolean(),
    pinned: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

async function resolveDiscussion(
  db: NodePgDatabase,
  ownerName: string,
  repoName: string,
  discussionId: string,
): Promise<{ repo?: any; discussion?: any }> {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, ownerName))
    .limit(1);

  if (!owner) return {};

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)),
    )
    .limit(1);

  if (!repo) return {};

  const [discussion] = await db
    .select()
    .from(discussions)
    .where(
      and(
        eq(discussions.id, discussionId),
        eq(discussions.repositoryId, repo.id),
      ),
    )
    .limit(1);

  if (!discussion) return {};

  return { repo, discussion };
}

export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner: ownerName, repo: repoName, id } = params;
  const db = getDatabase() as unknown as NodePgDatabase;

  const { repo, discussion } = await resolveDiscussion(
    db,
    ownerName!,
    repoName!,
    id!,
  );
  if (!repo || !discussion) return notFound("Discussion not found");

  // Read permission (anonymous OK for public repos)
  const tokenPayload = await getUserFromRequest(request);
  const hasAccess = await canReadRepo(tokenPayload?.userId, repo as any);
  if (!hasAccess) return notFound("Discussion not found");

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

  const [author] = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, discussion.authorId))
    .limit(1);

  return success(
    { ...discussion, author: author ?? null, comments },
    paginationMeta(countRow?.total ?? 0, pagination),
  );
});

export const PATCH: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner: ownerName, repo: repoName, id } = params;

  // 1. Authenticate
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized("You must be logged in to edit a discussion");
  }
  const userId = tokenPayload.userId;

  // 2. Parse body
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const result = updateDiscussionSchema.safeParse(raw);
  if (!result.success) {
    return badRequest("Invalid input", result.error.flatten());
  }

  const db = getDatabase() as unknown as NodePgDatabase;

  // 3. Resolve discussion
  const { repo, discussion } = await resolveDiscussion(
    db,
    ownerName!,
    repoName!,
    id!,
  );
  if (!repo || !discussion) return notFound("Discussion not found");

  // 4. Permission: author or repo write access
  const isAuthor = discussion.authorId === userId;
  const canWrite = await canWriteRepo(userId, repo as any);
  if (!isAuthor && !canWrite) {
    return forbidden("You do not have permission to edit this discussion");
  }

  // 5. Apply updates (title/body/category/close/reopen/pin/unpin)
  const updates: Record<string, unknown> = {};
  if (result.data.title !== undefined) updates.title = result.data.title;
  if (result.data.body !== undefined) updates.body = result.data.body;
  if (result.data.category !== undefined) {
    updates.category = result.data.category;
  }
  if (result.data.closed !== undefined) updates.closed = result.data.closed;
  if (result.data.pinned !== undefined) updates.pinned = result.data.pinned;
  updates.updatedAt = new Date();

  await db
    .update(discussions)
    .set(updates as any)
    .where(eq(discussions.id, discussion.id));

  const [updated] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, discussion.id))
    .limit(1);

  return success(updated);
});

export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner: ownerName, repo: repoName, id } = params;

  // 1. Authenticate
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized("You must be logged in to delete a discussion");
  }
  const userId = tokenPayload.userId;

  const db = getDatabase() as unknown as NodePgDatabase;

  // 2. Resolve discussion
  const { repo, discussion } = await resolveDiscussion(
    db,
    ownerName!,
    repoName!,
    id!,
  );
  if (!repo || !discussion) return notFound("Discussion not found");

  // 3. Permission: author or repo admin
  const isAuthor = discussion.authorId === userId;
  const isAdmin = await canAdminRepo(userId, repo as any);
  if (!isAuthor && !isAdmin) {
    return forbidden("You do not have permission to delete this discussion");
  }

  // Comments are removed via ON DELETE CASCADE
  await db.delete(discussions).where(eq(discussions.id, discussion.id));

  return noContent();
});
