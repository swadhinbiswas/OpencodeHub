import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";
import { parseBody, unauthorized, badRequest, notFound, forbidden, success, serverError } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { pushForkToUpstream } from "@/lib/federation";
import { resolveRepoPath } from "@/lib/git-storage";
import { decryptWorkflowSecret, isEncryptedWorkflowSecret } from "@/lib/workflow-secret-crypto";
import { isValidBranchName } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * POST /api/repos/[owner]/[repo]/federation/push-upstream
 *
 * Push a branch of THIS fork back to the upstream repository on the peer
 * instance (B). Uses the B-PAT stored (encrypted) at import time. B's own
 * git-receive-pack authorization gates whether the A user may contribute —
 * B "sets permission" by adding the user as a collaborator.
 *
 * Body: { branch }
 */
export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner: ownerName, repo: repoName } = params;
  const user = await getUserFromRequest(request);
  if (!user?.userId) return unauthorized();

  if (!ownerName || !repoName) return badRequest("Missing parameters");

  const db = getDatabase();
  const repoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!repoOwner) return notFound("Repository not found");

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, repoOwner.id),
      eq(schema.repositories.name, repoName),
    ),
  });
  if (!repo) return notFound("Repository not found");

  if (!(await canWriteRepo(user.userId, repo, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
    return forbidden();
  }

  const parsed = await parseBody(request, z.object({ branch: z.string().min(1).max(255) }));
  if ("error" in parsed) return parsed.error;
  const { branch } = parsed.data;

  if (!isValidBranchName(branch)) return badRequest("Invalid branch name");

  const upstreamUrl = repo.forkedFromUrl || repo.mirrorUrl;
  if (!upstreamUrl) {
    return badRequest("This repository is not a fork of an external instance");
  }
  if (!repo.mirrorToken) {
    return badRequest("No upstream token stored for this fork. Re-import with an auth token to enable push-back.");
  }

  const token = isEncryptedWorkflowSecret(repo.mirrorToken)
    ? decryptWorkflowSecret(repo.mirrorToken)
    : repo.mirrorToken;

  const repoPath = await resolveRepoPath(repo.diskPath);
  const result = await pushForkToUpstream(
    repoPath,
    upstreamUrl,
    token,
    branch,
    repo.mirrorUsername || undefined,
  );
  if (!result.success) {
    return serverError(`Failed to push to upstream: ${result.error}`);
  }

  logger.info(
    { repoId: repo.id, branch, upstreamUrl },
    "Fork pushed to upstream instance",
  );

  return success({ branch, sha: result.sha, upstreamUrl });
});