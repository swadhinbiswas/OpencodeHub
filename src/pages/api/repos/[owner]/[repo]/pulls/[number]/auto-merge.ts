import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { disableAutoMerge, enableAutoMerge, getAutoMergeStatus } from "@/lib/auto-merge";
import { compareBranches } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { checkPathPermissions } from "@/lib/path-scoping";

const enableSchema = z.object({
  mergeMethod: z.enum(["merge", "squash", "rebase"]).optional(),
});

async function resolveRepoAndPr(params: {
  owner?: string;
  repo?: string;
  number?: string;
}) {
  const ownerName = params.owner;
  const repoName = params.repo;
  const number = Number.parseInt(params.number || "", 10);
  if (!ownerName || !repoName || Number.isNaN(number)) {
    return { response: badRequest("Missing or invalid parameters"), repo: null, pr: null } as const;
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const owner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!owner) return { response: notFound("Repository not found"), repo: null, pr: null } as const;

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, owner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repo) return { response: notFound("Repository not found"), repo: null, pr: null } as const;

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repo.id),
      eq(schema.pullRequests.number, number)
    ),
  });
  if (!pr) return { response: notFound("Pull request not found"), repo: null, pr: null } as const;

  return { response: null, repo, pr } as const;
}

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const resolved = await resolveRepoAndPr(params);
  if (resolved.response || !resolved.repo || !resolved.pr) return resolved.response || badRequest("Invalid request");

  if (!(await canReadRepo(user.id, resolved.repo, { isAdmin: user.isAdmin }))) {
    return notFound("Repository not found");
  }

  const status = await getAutoMergeStatus(resolved.pr.id);
  return success(status);
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const resolved = await resolveRepoAndPr(params);
  if (resolved.response || !resolved.repo || !resolved.pr) return resolved.response || badRequest("Invalid request");

  if (!(await canWriteRepo(user.id, resolved.repo, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const repoPath = await resolveRepoPath(resolved.repo.diskPath);
  const { diffs } = await compareBranches(repoPath, resolved.pr.baseBranch, resolved.pr.headBranch);
  const changedFiles = diffs.map((diff) => diff.file).filter(Boolean);
  if (changedFiles.length > 0) {
    const permission = await checkPathPermissions(user.id, resolved.repo.id, changedFiles, "write");
    if (!permission.allowed) {
      return forbidden(permission.reason || "Insufficient path permissions for one or more changed files");
    }
  }

  const body = await request.json().catch(() => null);
  const parsed = enableSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid auto-merge payload");
  }

  const result = await enableAutoMerge(resolved.pr.id, user.id, {
    mergeMethod: parsed.data.mergeMethod || "merge",
  });
  if (!result.success) {
    return badRequest(result.error || "Failed to enable auto-merge");
  }

  const status = await getAutoMergeStatus(resolved.pr.id);
  return success(status);
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const resolved = await resolveRepoAndPr(params);
  if (resolved.response || !resolved.repo || !resolved.pr) return resolved.response || badRequest("Invalid request");

  if (!(await canWriteRepo(user.id, resolved.repo, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const repoPath = await resolveRepoPath(resolved.repo.diskPath);
  const { diffs } = await compareBranches(repoPath, resolved.pr.baseBranch, resolved.pr.headBranch);
  const changedFiles = diffs.map((diff) => diff.file).filter(Boolean);
  if (changedFiles.length > 0) {
    const permission = await checkPathPermissions(user.id, resolved.repo.id, changedFiles, "write");
    if (!permission.allowed) {
      return forbidden(permission.reason || "Insufficient path permissions for one or more changed files");
    }
  }

  const ok = await disableAutoMerge(resolved.pr.id);
  if (!ok) return badRequest("Failed to disable auto-merge");

  const status = await getAutoMergeStatus(resolved.pr.id);
  return success(status);
});
