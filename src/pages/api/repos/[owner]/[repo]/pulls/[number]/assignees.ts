import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { getUserFromRequest, getRepoAndUser } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, serverError } from "@/lib/api";
import { pullRequestAssignees } from "@/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";

// GET: list assignees of a pull request
export const GET: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo, number } = params;
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const repoData = await getRepoAndUser(request, owner, repo);
    if (!repoData) return notFound("Repository not found");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repoData.repository.id),
        eq(schema.pullRequests.number, parseInt(number)),
      ),
      with: { assignees: { with: { user: true } } },
    });
    if (!pr) return notFound("Pull request not found");

    return success({ assignees: pr.assignees.map((a) => a.user) });
  } catch (error) {
    logger.error({ err: error }, "Failed to list PR assignees");
    return serverError("Failed to list PR assignees");
  }
};

// POST: assign users to the PR { assigneeIds: string[] }
export const POST: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo, number } = params;
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const repoData = await getRepoAndUser(request, owner, repo);
    if (!repoData) return notFound("Repository not found");
    if (repoData.permission === "read") return unauthorized("Write access required");

    const body = await request.json();
    const { assigneeIds } = body;
    if (!Array.isArray(assigneeIds)) return badRequest("assigneeIds must be an array");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repoData.repository.id),
        eq(schema.pullRequests.number, parseInt(number)),
      ),
    });
    if (!pr) return notFound("Pull request not found");

    // Verify users exist
    const valid: string[] = [];
    for (const id of assigneeIds) {
      const u = await db.query.users.findFirst({
        where: eq(schema.users.id, id),
        columns: { id: true },
      });
      if (u) valid.push(id);
    }

    const existing = await db.query.pullRequestAssignees.findMany({
      where: and(
        eq(pullRequestAssignees.pullRequestId, pr.id),
        inArray(pullRequestAssignees.userId, valid),
      ),
      columns: { userId: true },
    });
    const existingIds = new Set(existing.map((e) => e.userId));
    const toAdd = valid.filter((id) => !existingIds.has(id));

    if (toAdd.length > 0) {
      await db.insert(pullRequestAssignees).values(
        toAdd.map((userId) => ({
          id: generateId(),
          pullRequestId: pr.id,
          userId,
          assignedAt: new Date(),
        })),
      );
    }

    const updated = await db.query.pullRequests.findFirst({
      where: eq(schema.pullRequests.id, pr.id),
      with: { assignees: { with: { user: true } } },
    });

    return success({
      assignees: (updated?.assignees ?? []).map((a) => a.user),
      added: toAdd,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to assign PR");
    return serverError("Failed to assign PR");
  }
};

// DELETE: unassign users { assigneeIds: string[] }
export const DELETE: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo, number } = params;
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const repoData = await getRepoAndUser(request, owner, repo);
    if (!repoData) return notFound("Repository not found");
    if (repoData.permission === "read") return unauthorized("Write access required");

    const body = await request.json();
    const { assigneeIds } = body;
    if (!Array.isArray(assigneeIds)) return badRequest("assigneeIds must be an array");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repoData.repository.id),
        eq(schema.pullRequests.number, parseInt(number)),
      ),
    });
    if (!pr) return notFound("Pull request not found");

    await db
      .delete(pullRequestAssignees)
      .where(
        and(
          eq(pullRequestAssignees.pullRequestId, pr.id),
          inArray(pullRequestAssignees.userId, assigneeIds),
        ),
      );

    return success({ removed: assigneeIds });
  } catch (error) {
    logger.error({ err: error }, "Failed to unassign PR");
    return serverError("Failed to unassign PR");
  }
};
