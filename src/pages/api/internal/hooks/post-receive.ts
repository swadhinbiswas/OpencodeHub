import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "@/lib/logger";
import { triggerRepoWorkflows } from "@/lib/workflows";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request, url }) => {
  // Verify internal hook secret for security
  const hookSecret = process.env.INTERNAL_HOOK_SECRET;
  if (!hookSecret) {
    return new Response("Server misconfigured", { status: 500 });
  }
  const providedSecret = request.headers.get("X-Hook-Secret");

  if (providedSecret !== hookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const repoPath = url.searchParams.get("repo");
  if (!repoPath) {
    return new Response("Missing repo path", { status: 400 });
  }

  let body: { oldrev: string; newrev: string; refname: string };
  try {
    body = await request.json();
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  logger.info({ repoPath, ref: body.refname, oldrev: body.oldrev, newrev: body.newrev }, "Post-receive hook");

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Extract owner and repo name from path for flexible lookup
  // Path formats: 
  //   - local: /path/to/data/repos/owner/repo.git
  //   - cloud diskPath: repos/owner/repo.git
  //   - temp path: /path/to/.tmp/repos/owner/repo.git
  const pathParts = repoPath.split('/');
  const repoGit = pathParts.pop() || '';
  const repoName = repoGit.replace('.git', '');
  const owner = pathParts.pop() || '';

  // Try finding by exact diskPath first
  let repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.diskPath, repoPath),
    with: { owner: true }
  });

  // If not found, try cloud storage path format
  if (!repo && owner && repoName) {
    const cloudPath = `repos/${owner}/${repoName}.git`;
    repo = await db.query.repositories.findFirst({
      where: eq(schema.repositories.diskPath, cloudPath),
      with: { owner: true }
    });
  }

  if (!repo) {
    logger.error({ repoPath }, "Repo not found in DB");
    return new Response("Repo not found", { status: 404 });
  }

  // Update repo updatedAt
  await db
    .update(schema.repositories)
    .set({ updatedAt: new Date() })
    .where(eq(schema.repositories.id, repo.id));

  // Trigger CI/CD Workflows (fire and forget)
  if (repo.hasActions && body.refname.startsWith("refs/heads/")) {
    try {
      triggerRepoWorkflows(
        repo.id,
        body.newrev,
        body.refname,
        repo.ownerId
      );
      logger.info({ repoId: repo.id }, "CI/CD workflows triggered");
    } catch (err) {
      logger.error({ err }, "Failed to trigger workflows");
    }
  }

  // Resolve repo path for git operations
  // ... existing code ...

  // Fetch commits
  let commits: any[] = [];
  try {
    const { resolveRepoPath } = await import("@/lib/git-storage");
    const { getGit } = await import("@/lib/git");
    const localRepoPath = await resolveRepoPath(repo.diskPath);
    const git = getGit(localRepoPath);

    // If new branch (oldrev is 000...), show from newrev
    const range = body.oldrev === "0000000000000000000000000000000000000000"
      ? body.newrev
      : `${body.oldrev}..${body.newrev}`;

    const log = await git.raw([
      "log",
      "--pretty=format:%H|%s|%an|%ae",
      "-n", "20", // Limit to 20 commits
      range
    ]);

    if (log) {
      commits = log.split("\n").filter(Boolean).map(line => {
        const [sha, message, authorName, authorEmail] = line.split("|");
        return {
          id: sha,
          message,
          url: `${process.env.SITE_URL || 'http://localhost:3000'}/${owner}/${repoName}/commit/${sha}`,
          author: {
            name: authorName,
            email: authorEmail
          }
        };
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to parse commits");
  }

  // Trigger Webhooks
  try {
    const { triggerWebhooks } = await import("@/lib/webhooks");
    // Get pusher from body (passed by hook script) or default
    const pusherName = (body as any).pusher || "git-user";

    await triggerWebhooks(repo.id, "push", {
      ref: body.refname,
      before: body.oldrev,
      after: body.newrev,
      repository: {
        id: repo.id,
        name: repo.name,
        full_name: `${repo.owner.username}/${repo.name}`,
        owner: {
          name: repo.owner.username,
          email: repo.owner.email,
        },
        html_url: `${process.env.SITE_URL || 'http://localhost:3000'}/${repo.owner.username}/${repo.name}`,
      },
      pusher: {
        name: pusherName,
      },
      commits: commits,
    });
    logger.info({ repoId: repo.id }, "Webhooks triggered");
  } catch (err) {
    logger.error({ err }, "Failed to trigger webhooks");
  }

  return new Response("OK", { status: 200 });
};
