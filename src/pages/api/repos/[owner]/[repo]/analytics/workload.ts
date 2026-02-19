import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, parseQuery, success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import { getDeveloperWorkloads } from "@/lib/analytics-advanced";

const querySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

async function resolveRepository(owner: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!repoOwner) return null;
  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, repoOwner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
}

export const GET: APIRoute = withErrorHandler(async ({ params, url, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const parsed = parseQuery(url, querySchema);
  if ("error" in parsed) return parsed.error;

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");
  if (!(await canReadRepo(locals.user?.id, repository, { isAdmin: locals.user?.isAdmin }))) {
    return notFound("Repository not found");
  }

  const days = parsed.data.days ?? 30;
  const limit = parsed.data.limit ?? 50;
  const workloads = await getDeveloperWorkloads({
    repositoryId: repository.id,
    days,
  });

  const totalScore = workloads.reduce((sum, entry) => sum + entry.workloadScore, 0);
  const averageScore = workloads.length > 0 ? Math.round((totalScore / workloads.length) * 100) / 100 : 0;

  return success({
    repositoryId: repository.id,
    days,
    summary: {
      totalContributors: workloads.length,
      averageWorkloadScore: averageScore,
      overloadedCount: workloads.filter((w) => w.workloadScore >= 80).length,
      underutilizedCount: workloads.filter((w) => w.workloadScore <= 20).length,
    },
    contributors: workloads.slice(0, limit),
  });
});
