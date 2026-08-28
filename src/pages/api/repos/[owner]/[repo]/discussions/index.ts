import { getDatabase } from "@/db";
import { discussions, DISCUSSION_CATEGORIES } from "@/db/schema/discussions";
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
import { logger } from "@/lib/logger";
import { canReadRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";
import type { APIRoute } from "astro";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

export const createDiscussionSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1).max(65535),
  category: z.enum(DISCUSSION_CATEGORIES).optional().default("General"),
});

export const listDiscussionsQuerySchema = z.object({
  category: z.enum(DISCUSSION_CATEGORIES).optional(),
  closed: z
    .string()
    .refine((v): v is "true" | "false" => v === "true" || v === "false", {
      message: "closed must be 'true' or 'false'",
    })
    .transform((v) => v === "true")
    .optional(),
  sort: z.enum(["lastActivity", "newest"]).optional().default("lastActivity"),
});

async function resolveRepo(db: NodePgDatabase, ownerName: string, repoName: string) {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, ownerName))
    .limit(1);

  if (!owner) return null;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)),
    )
    .limit(1);

  return repo ?? null;
}

export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner: ownerName, repo: repoName } = params;
  const db = getDatabase() as unknown as NodePgDatabase;

  // 1. Resolve owner & repository
  const repo = await resolveRepo(db, ownerName!, repoName!);
  if (!repo) return notFound("Repository not found");

  // 2. Read permission (anonymous OK for public repos)
  const tokenPayload = await getUserFromRequest(request);
  const hasAccess = await canReadRepo(tokenPayload?.userId, repo as any);
  if (!hasAccess) return notFound("Repository not found");

  // 3. Filters + pagination
  const url = new URL(request.url);
  const query = listDiscussionsQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!query.success) {
    return badRequest("Invalid query parameters", query.error.flatten());
  }
  const { category, closed, sort } = query.data;
  const pagination = getPagination(url);

  const conditions = [eq(discussions.repositoryId, repo.id)];
  if (category) conditions.push(eq(discussions.category, category));
  if (closed !== undefined) conditions.push(eq(discussions.closed, closed));

  const rows = await db
    .select({
      id: discussions.id,
      title: discussions.title,
      body: discussions.body,
      category: discussions.category,
      pinned: discussions.pinned,
      closed: discussions.closed,
      commentCount: discussions.commentCount,
      lastActivityAt: discussions.lastActivityAt,
      createdAt: discussions.createdAt,
      updatedAt: discussions.updatedAt,
      author: {
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(discussions)
    .innerJoin(users, eq(discussions.authorId, users.id))
    .where(and(...conditions))
    .orderBy(
      desc(discussions.pinned),
      sort === "newest"
        ? desc(discussions.createdAt)
        : desc(discussions.lastActivityAt),
    )
    .limit(pagination.perPage)
    .offset(pagination.offset);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(discussions)
    .where(and(...conditions));

  return success(rows, paginationMeta(countRow?.total ?? 0, pagination));
});

export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner: ownerName, repo: repoName } = params;

  // 1. Authenticate
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized("You must be logged in to create a discussion");
  }
  const userId = tokenPayload.userId;

  // 2. Parse body
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const result = createDiscussionSchema.safeParse(raw);
  if (!result.success) {
    return badRequest("Invalid input", result.error.flatten());
  }
  const { title, body, category } = result.data;

  const db = getDatabase() as unknown as NodePgDatabase;

  // 3. Resolve repository
  const repo = await resolveRepo(db, ownerName!, repoName!);
  if (!repo) return notFound("Repository not found");

  // GitHub model: anyone who can read the repository can start a discussion
  const hasPermission = await canReadRepo(userId, repo as any);
  if (!hasPermission) return notFound("Repository not found");

  // 4. Create discussion
  const discussionId = generateId("discussion");
  const createdAt = new Date();

  const newDiscussion = {
    id: discussionId,
    repositoryId: repo.id,
    authorId: userId,
    title,
    body,
    category,
    pinned: false,
    closed: false,
    commentCount: 0,
    lastActivityAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };

  await db.insert(discussions).values(newDiscussion);

  logger.info(
    { userId, repoId: repo.id, discussionId },
    "Discussion created",
  );

  return created({
    ...newDiscussion,
    author: { id: userId, username: tokenPayload.username },
    url: `/${ownerName}/${repoName}/discussions/${discussionId}`,
  });
});
