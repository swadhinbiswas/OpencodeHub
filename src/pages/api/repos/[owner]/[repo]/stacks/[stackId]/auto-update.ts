import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { canWriteRepo } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { autoUpdateStack, stackNeedsRebase } from "@/lib/stack-rebase";

async function resolveContext(params: Record<string, string | undefined>, userId: string) {
  const { owner: ownerName, repo: repoName, stackId } = params;
  if (!ownerName || !repoName || !stackId) return { response: badRequest("Missing parameters") } as const;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const owner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!owner) return { response: notFound("Repository not found") } as const;

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, owner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repo) return { response: notFound("Repository not found") } as const;
  if (!(await canWriteRepo(userId, repo))) return { response: forbidden() } as const;

  const stack = await db.query.prStacks.findFirst({
    where: and(
      eq(schema.prStacks.id, stackId),
      eq(schema.prStacks.repositoryId, repo.id)
    ),
  });
  if (!stack) return { response: notFound("Stack not found") } as const;

  return { response: null, stackId } as const;
}

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const resolved = await resolveContext(params, user.id);
  if (resolved.response || !resolved.stackId) {
    return resolved.response || badRequest("Invalid request");
  }

  const status = await stackNeedsRebase(resolved.stackId);
  return success({
    ...status,
    upToDate: !status.needsRebase,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const resolved = await resolveContext(params, user.id);
  if (resolved.response || !resolved.stackId) {
    return resolved.response || badRequest("Invalid request");
  }

  const status = await stackNeedsRebase(resolved.stackId);
  if (!status.needsRebase) {
    return success({
      needsRebase: false,
      behindBy: status.behindBy,
      performed: false,
      message: "Stack already up to date",
      result: {
        success: true,
        rebased: [],
        failed: [],
        conflicts: [],
      },
    });
  }

  const result = await autoUpdateStack(resolved.stackId);

  return success({
    needsRebase: status.needsRebase,
    behindBy: status.behindBy,
    performed: true,
    message: result.success
      ? `Auto-update complete (${result.rebased.length} PRs rebased)`
      : "Auto-update completed with conflicts",
    result,
  });
});
