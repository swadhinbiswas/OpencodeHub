import type { APIRoute } from "astro";
import { importExternalRepository, importRepoSchema } from "@/lib/external-import";
import { getUserFromRequest } from "@/lib/auth";
import { parseBody, unauthorized, badRequest, serverError, success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";

/**
 * POST /api/repos/import
 * Import a repository from another Git hosting service (GitHub, GitLab,
 * Bitbucket, or any public/private git URL) into the caller's account.
 *
 * Body:
 *  - sourceUrl: string  (required)  https://…, git@host:…, ssh://…, or owner/repo
 *  - name?: string                   override repo name (default: derived from URL)
 *  - description?: string
 *  - visibility?: 'public'|'private'|'internal'  (default: public)
 *  - mirror?: boolean                (default: true) sync with upstream automatically
 *  - authToken?: string              token/PAT for private repositories (https only)
 *  - hasIssues?: boolean             (default: true)
 *  - hasWiki?: boolean               (default: false)
 *  - hasActions?: boolean            (default: true)
 */
export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) {
    return unauthorized();
  }

  const parsed = await parseBody(request, importRepoSchema);
  if ("error" in parsed) return parsed.error;

  const result = await importExternalRepository(
    tokenPayload.userId,
    parsed.data as Parameters<typeof importExternalRepository>[1],
  );

  if (!result.success) {
    return badRequest(result.error || "Failed to import repository");
  }

  return success({
    id: result.repositoryId,
    fullName: `${result.owner}/${result.name}`,
    url: result.url,
    defaultBranch: result.defaultBranch,
    mirror: parsed.data.mirror,
  });
});
