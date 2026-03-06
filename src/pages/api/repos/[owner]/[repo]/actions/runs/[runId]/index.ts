/**
 * CI/CD Run Detail API - Get single workflow run with jobs
 */
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo, runId } = params;
  if (!owner || !repo || !runId) return badRequest("Missing parameters");

  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);

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

  const hasAccess = await canReadRepo(tokenPayload?.userId, repoData);
  if (!hasAccess) return notFound("Repository not found");

  const run = await db.query.workflowRuns.findFirst({
    where: and(
      eq(schema.workflowRuns.id, runId),
      eq(schema.workflowRuns.repositoryId, repoData.id),
    ),
  });
  if (!run) return notFound("Workflow run not found");

  // Fetch jobs for this run
  const jobs = await (db as any)
    .select()
    .from(schema.workflowJobs)
    .where(eq(schema.workflowJobs.runId, runId));

  const mapped = {
    id: run.id,
    number: run.runNumber,
    status: run.status,
    conclusion: run.conclusion,
    branch: run.headBranch,
    commit: run.headSha,
    event: run.event,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    duration:
      run.startedAt && run.completedAt
        ? Math.round(
            (new Date(run.completedAt as any).getTime() -
              new Date(run.startedAt as any).getTime()) /
              1000,
          )
        : undefined,
    jobs: jobs.map((j: any) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
    })),
  };

  return success(mapped);
});
