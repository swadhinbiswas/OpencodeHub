import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canWriteRepo } from "@/lib/permissions";
import { bulkMergePRs } from "@/lib/bulk-merge";
import { compareBranches } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { checkPathPermissions } from "@/lib/path-scoping";

const bulkMergeSchema = z.object({
  prIds: z.array(z.string().min(1)).min(1).max(100),
  mergeMethod: z.enum(["merge", "squash", "rebase"]).optional(),
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const { owner: ownerName, repo: repoName } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!ownerName || !repoName) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const owner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!owner) return notFound("Repository not found");

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, owner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repo) return notFound("Repository not found");
  if (!(await canWriteRepo(user.id, repo))) return forbidden();

  const body = await request.json().catch(() => null);
  const parsed = bulkMergeSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid bulk merge payload");
  }

  const uniquePrIds = [...new Set(parsed.data.prIds)];
  const repoPrs = await db.query.pullRequests.findMany({
    where: and(
      eq(schema.pullRequests.repositoryId, repo.id),
      inArray(schema.pullRequests.id, uniquePrIds)
    ),
    columns: { id: true, number: true, baseBranch: true, headBranch: true },
  });

  const repoPrIds = new Set(repoPrs.map((pr) => pr.id));
  const invalidIds = uniquePrIds.filter((prId) => !repoPrIds.has(prId));
  if (invalidIds.length > 0) {
    return badRequest("Some pull requests do not belong to this repository");
  }

  const repoPath = await resolveRepoPath(repo.diskPath);
  for (const pr of repoPrs) {
    const { diffs } = await compareBranches(repoPath, pr.baseBranch, pr.headBranch);
    const changedFiles = diffs.map((diff) => diff.file).filter(Boolean);
    if (changedFiles.length === 0) continue;

    const permission = await checkPathPermissions(user.id, repo.id, changedFiles, "write");
    if (!permission.allowed) {
      return forbidden(
        permission.reason || `Insufficient path permissions for PR #${pr.number}`
      );
    }
  }

  const result = await bulkMergePRs(uniquePrIds, user.id, {
    mergeMethod: parsed.data.mergeMethod,
  });

  return success(result);
});
