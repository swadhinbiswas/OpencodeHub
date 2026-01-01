import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";
import { triggerRepoWorkflows } from "@/lib/workflows";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request, url }) => {
  // Verify internal hook secret for security
  const hookSecret = process.env.INTERNAL_HOOK_SECRET || "dev-hook-secret-change-in-production";
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

  const db = getDatabase();

  // Find repo by diskPath
  const repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.diskPath, repoPath),
    with: {
      owner: true,
    },
  });

  if (!repo) {
    logger.error({ repoPath }, "Repo not found in DB");
    return new Response("Repo not found", { status: 404 });
  }

  // Update repo updatedAt
  await db
    .update(schema.repositories)
    .set({ updatedAt: new Date().toISOString() })
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

  // Trigger Webhooks
  try {
    const { triggerWebhooks } = await import("@/lib/webhooks");
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
        name: "git-user", // TODO: Get from auth
      },
      commits: [], // TODO: Parse new commits
    });
    logger.info({ repoId: repo.id }, "Webhooks triggered");
  } catch (err) {
    logger.error({ err }, "Failed to trigger webhooks");
  }

  return new Response("OK", { status: 200 });
};
