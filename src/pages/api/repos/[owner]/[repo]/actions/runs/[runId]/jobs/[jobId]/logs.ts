import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { badRequest, forbidden, notFound, success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";

function getInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const runId = params.runId;
  const jobId = params.jobId;
  if (!owner || !repoName || !runId || !jobId) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("Repository not found");

  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user?.userId, repository, { isAdmin: user?.isAdmin }))) {
    return forbidden();
  }

  const run = await db.query.workflowRuns.findFirst({
    where: and(
      eq(schema.workflowRuns.id, runId),
      eq(schema.workflowRuns.repositoryId, repository.id)
    ),
  });
  if (!run) return notFound("Workflow run not found");

  const job = await db.query.workflowJobs.findFirst({
    where: and(
      eq(schema.workflowJobs.id, jobId),
      eq(schema.workflowJobs.runId, run.id)
    ),
  });
  if (!job) return notFound("Workflow job not found");

  const url = new URL(request.url);
  const afterLine = Math.max(0, getInt(url.searchParams.get("afterLine"), 0));
  const limit = Math.min(2000, Math.max(50, getInt(url.searchParams.get("limit"), 500)));

  const rows = await db.query.workflowLogs.findMany({
    where: and(
      eq(schema.workflowLogs.jobId, job.id),
      gt(schema.workflowLogs.lineNumber, afterLine)
    ),
    orderBy: [asc(schema.workflowLogs.lineNumber)],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const logs = hasMore ? rows.slice(0, limit) : rows;
  const nextAfterLine = logs.length > 0 ? logs[logs.length - 1].lineNumber : afterLine;

  return success({
    logs,
    hasMore,
    nextAfterLine,
  });
});
