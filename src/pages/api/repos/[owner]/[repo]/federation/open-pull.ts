import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";
import { parseBody, unauthorized, badRequest, notFound, forbidden, success, serverError } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUrlOrigin, pushForkToUpstream } from "@/lib/federation";
import { getSiteUrl } from "@/lib/site-url";
import { resolveRepoPath } from "@/lib/git-storage";
import { decryptWorkflowSecret, isEncryptedWorkflowSecret } from "@/lib/workflow-secret-crypto";
import { isValidBranchName } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * POST /api/repos/[owner]/[repo]/federation/open-pull
 *
 * Open a cross-instance pull request on the upstream instance (B) whose head
 * is THIS fork's branch. Server-to-server: calls B's
 * `POST /api/repos/<upstreamOwner>/<upstreamRepo>/external-pulls` using the
 * stored B-PAT. B must have allowExternalPulls enabled (or the A user must be
 * a B collaborator).
 *
 * Body: { headBranch, baseBranch, title, body }
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

  const parsed = await parseBody(request, openPullSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  if (!isValidBranchName(body.headBranch) || !isValidBranchName(body.baseBranch)) {
    return badRequest("Invalid branch name");
  }

  const upstreamUrl = repo.forkedFromUrl || repo.mirrorUrl;
  if (!upstreamUrl) {
    return badRequest("This repository is not a fork of an external instance");
  }

  const upstreamOrigin = getUrlOrigin(upstreamUrl);
  if (!upstreamOrigin) return badRequest("Invalid upstream URL");

  // Parse upstream owner/repo from the upstream clone URL path.
  const upstreamMatch = parseUpstreamPath(upstreamUrl);
  if (!upstreamMatch) {
    return badRequest("Unable to parse upstream repository from URL");
  }

  if (!repo.mirrorToken) {
    return badRequest("No upstream token stored for this fork. Re-import with an auth token to enable cross-instance PRs.");
  }
  const token = isEncryptedWorkflowSecret(repo.mirrorToken)
    ? decryptWorkflowSecret(repo.mirrorToken)
    : repo.mirrorToken;

  const siteUrl = getSiteUrl();
  const forkCloneUrl = `${siteUrl}/${ownerName}/${repoName}.git`;

  let response: Response;
  try {
    response = await fetch(`${upstreamOrigin}/api/repos/${upstreamMatch.owner}/${upstreamMatch.repo}/external-pulls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sourceUrl: forkCloneUrl,
        headBranch: body.headBranch,
        baseBranch: body.baseBranch,
        title: body.title,
        body: body.body ?? "",
        draft: body.draft ?? false,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return serverError(`Failed to reach upstream instance: ${message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.warn({ upstreamOrigin, status: response.status, text }, "Cross-instance PR rejected by upstream");
    return serverError(`Upstream instance rejected the PR (${response.status}): ${text.slice(0, 300)}`);
  }

  const json = await response.json().catch(() => null);
  const pr = json?.data ?? json;
  return success({ number: pr?.number, id: pr?.id, upstreamUrl });
});

function parseUpstreamPath(url: string): { owner: string; repo: string } | null {
  try {
    const path = new URL(url).pathname.replace(/\.git$/, "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

const openPullSchema = z.object({
  headBranch: z.string().min(1).max(255),
  baseBranch: z.string().min(1).max(255),
  title: z.string().min(1).max(500),
  body: z.string().max(65535).optional(),
  draft: z.boolean().optional(),
});
