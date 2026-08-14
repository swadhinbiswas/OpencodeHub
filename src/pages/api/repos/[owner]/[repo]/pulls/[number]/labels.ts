import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { getRepoAndUser } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, serverError } from "@/lib/api";
import { pullRequestLabels } from "@/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";

// GET: List labels applied to a pull request
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
      with: { labels: { with: { label: true } } },
    });
    if (!pr) return notFound("Pull request not found");

    return success({ labels: pr.labels.map((l) => l.label) });
  } catch (error) {
    logger.error({ err: error }, "Failed to list PR labels");
    return serverError("Failed to list PR labels");
  }
};

// POST: Apply labels to a pull request { labels: string[] }
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
    const { labels } = body;
    if (!Array.isArray(labels) || labels.length === 0) {
      return badRequest("labels must be a non-empty array of label IDs");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repoData.repository.id),
        eq(schema.pullRequests.number, parseInt(number)),
      ),
    });
    if (!pr) return notFound("Pull request not found");

    // Validate labels belong to this repository
    const repoLabels = await db.query.labels.findMany({
      where: and(
        eq(schema.labels.repositoryId, repoData.repository.id),
        inArray(schema.labels.id, labels),
      ),
      columns: { id: true },
    });
    if (repoLabels.length !== new Set(labels).size) {
      return badRequest("One or more labels do not exist in this repository");
    }

    // Apply only labels not already applied
    const existing = await db.query.pullRequestLabels.findMany({
      where: and(
        eq(pullRequestLabels.pullRequestId, pr.id),
        inArray(pullRequestLabels.labelId, labels),
      ),
      columns: { labelId: true },
    });
    const existingIds = new Set(existing.map((e) => e.labelId));
    const toAdd = labels.filter((id) => !existingIds.has(id));

    if (toAdd.length > 0) {
      await db.insert(pullRequestLabels).values(
        toAdd.map((labelId) => ({
          id: generateId(),
          pullRequestId: pr.id,
          labelId,
        })),
      );
    }

    const updated = await db.query.pullRequests.findFirst({
      where: eq(schema.pullRequests.id, pr.id),
      with: { labels: { with: { label: true } } },
    });

    return success({
      labels: (updated?.labels ?? []).map((l) => l.label),
      added: toAdd,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to apply PR labels");
    return serverError("Failed to apply PR labels");
  }
};

// DELETE: Remove labels from a pull request { labels: string[] }
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
    const { labels } = body;
    if (!Array.isArray(labels) || labels.length === 0) {
      return badRequest("labels must be a non-empty array of label IDs");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repoData.repository.id),
        eq(schema.pullRequests.number, parseInt(number)),
      ),
    });
    if (!pr) return notFound("Pull request not found");

    await db
      .delete(pullRequestLabels)
      .where(
        and(
          eq(pullRequestLabels.pullRequestId, pr.id),
          inArray(pullRequestLabels.labelId, labels),
        ),
      );

    return success({ removed: labels });
  } catch (error) {
    logger.error({ err: error }, "Failed to remove PR labels");
    return serverError("Failed to remove PR labels");
  }
};
