import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, desc } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { generateId } from "@/lib/utils";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// GET: List milestones
export const GET: APIRoute = withErrorHandler(async ({ params }) => {
  const { owner, repo } = params!;
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, owner!),
  });
  if (!user) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, user.id),
      eq(schema.repositories.name, repo!),
    ),
  });
  if (!repoData) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const milestones = await db.query.milestones.findMany({
    where: eq(schema.milestones.repositoryId, repoData.id),
    orderBy: [desc(schema.milestones.createdAt)],
  });

  return new Response(JSON.stringify({ data: milestones }), { status: 200 });
});

// POST: Create milestone
export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner, repo } = params!;
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, owner!),
  });
  if (!user) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, user.id),
      eq(schema.repositories.name, repo!),
    ),
  });
  if (!repoData) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const body = await request.json();
  const { title, description, dueDate } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Title is required" }), { status: 400 });
  }

  const milestoneId = generateId("milestone");
  const now = new Date();

  await db.insert(schema.milestones).values({
    id: milestoneId,
    repositoryId: repoData.id,
    title: title.trim(),
    description: description || null,
    state: "open",
    dueDate: dueDate ? new Date(dueDate) : null,
    createdAt: now,
    updatedAt: now,
  });

  logger.info({ milestoneId, repoId: repoData.id }, "Milestone created");

  return new Response(JSON.stringify({
    id: milestoneId,
    title: title.trim(),
    description,
    state: "open",
    dueDate,
    createdAt: now,
  }), { status: 201 });
});
