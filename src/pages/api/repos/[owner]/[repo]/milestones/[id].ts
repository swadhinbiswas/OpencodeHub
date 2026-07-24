import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// PATCH: Update milestone
export const PATCH: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner, repo, id } = params!;
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

  const milestone = await db.query.milestones.findFirst({
    where: and(
      eq(schema.milestones.id, id!),
      eq(schema.milestones.repositoryId, repoData.id),
    ),
  });
  if (!milestone) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const body = await request.json();
  const updates: any = { updatedAt: new Date() };

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.state !== undefined) {
    updates.state = body.state;
    if (body.state === "closed") updates.closedAt = new Date();
    else updates.closedAt = null;
  }
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  await db.update(schema.milestones)
    .set(updates)
    .where(eq(schema.milestones.id, milestone.id));

  logger.info({ milestoneId: milestone.id }, "Milestone updated");

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});

// DELETE: Delete milestone
export const DELETE: APIRoute = withErrorHandler(async ({ params }) => {
  const { owner, repo, id } = params!;
  
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

  const milestone = await db.query.milestones.findFirst({
    where: and(
      eq(schema.milestones.id, id!),
      eq(schema.milestones.repositoryId, repoData.id),
    ),
  });
  if (!milestone) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  await db.delete(schema.milestones).where(eq(schema.milestones.id, milestone.id));

  logger.info({ milestoneId: milestone.id }, "Milestone deleted");

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
