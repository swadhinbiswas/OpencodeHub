/**
 * Issue Comments API
 * GET  — List comments for an issue
 * POST — Add a comment to an issue
 */

import { getDatabase, schema } from "@/db";
import {
  badRequest,
  notFound,
  serverError,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo, number } = params;
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find repo
    const repository = await db.query.repositories.findFirst({
      where: and(eq(schema.repositories.name, repo)),
    });
    if (!repository) return notFound("Repository not found");

    // Find issue
    const issue = await db.query.issues.findFirst({
      where: and(
        eq(schema.issues.repositoryId, repository.id),
        eq(schema.issues.number, parseInt(number)),
      ),
    });
    if (!issue) return notFound("Issue not found");

    // Get comments
    const comments = await db.query.issueComments.findMany({
      where: eq(schema.issueComments.issueId, issue.id),
      orderBy: [asc(schema.issueComments.createdAt)],
      with: {
        author: {
          columns: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return success({ data: comments });
  } catch (error) {
    logger.error({ error }, "Failed to list issue comments");
    return serverError("Failed to list comments");
  }
};

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo, number } = params;
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find repo
    const repository = await db.query.repositories.findFirst({
      where: and(eq(schema.repositories.name, repo)),
    });
    if (!repository) return notFound("Repository not found");

    // Find issue
    const issue = await db.query.issues.findFirst({
      where: and(
        eq(schema.issues.repositoryId, repository.id),
        eq(schema.issues.number, parseInt(number)),
      ),
    });
    if (!issue) return notFound("Issue not found");

    const body = (await request.json()) as { body?: string };
    if (!body.body?.trim()) return badRequest("Comment body is required");
    const [comment] = await db
      .insert(schema.issueComments)
      .values({
        id: crypto.randomUUID(),
        issueId: issue.id,
        authorId: user.userId,
        body: body.body.trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    logger.info(
      { issueNumber: number, userId: user.userId },
      "Issue comment created",
    );

    return new Response(JSON.stringify({ data: comment }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logger.error({ error }, "Failed to create issue comment");
    return serverError("Failed to create comment");
  }
};
