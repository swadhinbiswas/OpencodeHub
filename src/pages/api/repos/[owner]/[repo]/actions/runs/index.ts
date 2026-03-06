/**
 * CI/CD Runs API - List workflow runs for a repository
 */
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) return badRequest("Owner and repo required");

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

  const url = new URL(request.url);
  const branch = url.searchParams.get("branch");
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") || "20");

  const conditions = [eq(schema.workflowRuns.repositoryId, repoData.id)];
  if (branch) conditions.push(eq(schema.workflowRuns.headBranch, branch));
  if (status) conditions.push(eq(schema.workflowRuns.status, status));

  const runs = await (db as any)
    .select()
    .from(schema.workflowRuns)
    .where(and(...conditions))
    .orderBy(desc(schema.workflowRuns.startedAt))
    .limit(limit);

  // Map to CLI-friendly format
  const mapped = runs.map((run: any) => ({
    id: run.id,
    number: run.runNumber,
    status: run.status,
    conclusion: run.conclusion,
    branch: run.headBranch,
    commit: run.headSha,
    event: run.event,
    createdAt: run.startedAt || run.completedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    duration:
      run.startedAt && run.completedAt
        ? Math.round(
            (new Date(run.completedAt).getTime() -
              new Date(run.startedAt).getTime()) /
              1000,
          )
        : undefined,
  }));

  return success(mapped);
});
