/**
 * CI/CD Rerun API - Retry a workflow run
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
import { randomUUID } from "node:crypto";

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

  // Create a new run as a rerun of this one
  const newRun = {
    id: randomUUID(),
    workflowId: run.workflowId,
    repositoryId: run.repositoryId,
    runNumber: run.runNumber,
    runAttempt: (run.runAttempt || 1) + 1,
    name: run.name,
    displayTitle: run.displayTitle,
    status: "queued",
    event: run.event,
    headBranch: run.headBranch,
    headSha: run.headSha,
    baseBranch: run.baseBranch,
    baseSha: run.baseSha,
    pullRequestId: run.pullRequestId,
    triggeredById: tokenPayload.userId,
  };

  await (db as any).insert(schema.workflowRuns).values(newRun);

  return success({
    id: newRun.id,
    status: "queued",
    message: "Rerun triggered",
  });
});
