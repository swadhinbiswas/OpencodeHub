/**
 * CI/CD Cancel API - Cancel a running workflow
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
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo, runId } = params;
  if (!owner || !repo || !runId) return badRequest("Missing parameters");

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

  const run = await db.query.workflowRuns.findFirst({
    where: and(
      eq(schema.workflowRuns.id, runId),
      eq(schema.workflowRuns.repositoryId, repoData.id),
    ),
  });
  if (!run) return notFound("Workflow run not found");

  if (run.status === "completed") {
    return badRequest("Cannot cancel a completed run");
  }

  // Update run status to cancelled
  await (db as any)
    .update(schema.workflowRuns)
    .set({
      status: "completed",
      conclusion: "cancelled",
      completedAt: new Date(),
    })
    .where(eq(schema.workflowRuns.id, runId));

  // Cancel all in-progress/queued jobs
  await (db as any)
    .update(schema.workflowJobs)
    .set({
      status: "completed",
      conclusion: "cancelled",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.workflowJobs.runId, runId),
        eq(schema.workflowJobs.status, "in_progress"),
      ),
    );

  return success({ message: "Workflow run cancelled" });
});
