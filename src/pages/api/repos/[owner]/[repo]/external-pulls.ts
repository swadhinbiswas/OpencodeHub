import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { getUserFromRequest } from "@/lib/auth";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { parseBody, unauthorized, badRequest, notFound, forbidden, success, serverError } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { validateFederationSourceUrl, createExternalPullRequest } from "@/lib/federation";
import { logger } from "@/lib/logger";
import { isValidBranchName } from "@/lib/utils";

/**
 * POST /api/repos/[owner]/[repo]/external-pulls
 *
 * Create a cross-instance pull request on THIS instance whose head lives on a
 * fork hosted by a peer OpenCodeHub instance.
 *
 * Body:
 *   sourceUrl   (required) fork clone URL on the peer instance (https)
 *   headBranch  (required) branch on the fork
 *   baseBranch  (required) branch on this repo
 *   title       (required) PR title
 *   body        (optional) PR description
 *   authToken   (optional) PAT for a private fork (https only)
 *   draft       (optional) boolean
 *
 * Permissions: caller must have read access; write access OR the repo's
 * `allowExternalPulls` flag is required to create the PR.
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

  const parsed = await parseBody(request, externalPullSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // Verify the head actually points at a git clone URL (SSRF protected).
  const urlCheck = await validateFederationSourceUrl(body.sourceUrl);
  if (!urlCheck.valid) return badRequest(urlCheck.reason);

  if (!isValidBranchName(body.headBranch) || !isValidBranchName(body.baseBranch)) {
    return badRequest("Invalid branch name");
  }
  if (body.headBranch === body.baseBranch) {
    return badRequest("Base and head branches must be different");
  }

  const canRead = await canReadRepo(user.userId, repo, { isAdmin: user.isAdmin });
  if (!canRead) return forbidden();

  const canWrite = await canWriteRepo(user.userId, repo, {
    isAdmin: user.isAdmin,
    tokenScopes: user.scopes,
  });
  if (!canWrite && repo.allowExternalPulls !== true) {
    return forbidden("This repository does not accept external pull requests");
  }

  // Sanitize title/body like the normal PR endpoint
  const sanitize = (s: string) => s.replace(/<[^>]*>/g, "");
  const title = sanitize(body.title.trim());
  const description = sanitize((body.body || "").trim());

  const result = await createExternalPullRequest({
    repositoryId: repo.id,
    authorId: user.userId,
    sourceUrl: body.sourceUrl,
    headBranch: body.headBranch,
    baseBranch: body.baseBranch,
    title,
    body: description || undefined,
    authToken: body.authToken,
    isDraft: body.draft,
  });

  if (!result.success) return badRequest(result.error);

  logger.info(
    { repoId: repo.id, prNumber: result.number, sourceUrl: body.sourceUrl },
    "External pull request created",
  );

  return success({
    id: result.prId,
    number: result.number,
    headSha: result.sha,
    headRepositoryId: null,
  });
});

const externalPullSchema = z.object({
  sourceUrl: z.string().min(1).max(500),
  headBranch: z.string().min(1).max(255),
  baseBranch: z.string().min(1).max(255),
  title: z.string().min(1).max(500),
  body: z.string().max(65535).optional(),
  authToken: z.string().min(1).max(500).optional(),
  draft: z.boolean().optional(),
});
