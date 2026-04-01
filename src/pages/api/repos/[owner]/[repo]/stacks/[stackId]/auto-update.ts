import { getDatabase, schema } from "@/db";
import {
  badRequest,
  forbidden,
  notFound,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canWriteRepo } from "@/lib/permissions";
import { autoUpdateStack, stackNeedsRebase } from "@/lib/stack-rebase";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

async function resolveActor(
  db: NodePgDatabase<typeof schema>,
  request: Request,
  localUser: { id: string; isAdmin?: boolean | null } | null | undefined,
) {
  if (localUser?.id) {
    return localUser;
  }

  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return null;
  }

  return db.query.users.findFirst({
    where: eq(schema.users.id, tokenPayload.userId),
    columns: { id: true, isAdmin: true },
  });
}

async function resolveContext(
  params: Record<string, string | undefined>,
  actor: { id: string; isAdmin?: boolean | null },
) {
  const { owner: ownerName, repo: repoName, stackId } = params;
  if (!ownerName || !repoName || !stackId)
    return { response: badRequest("Missing parameters") } as const;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const owner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!owner) return { response: notFound("Repository not found") } as const;

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, owner.id),
      eq(schema.repositories.name, repoName),
    ),
  });
  if (!repo) return { response: notFound("Repository not found") } as const;
  if (
    !(await canWriteRepo(actor.id, repo, {
      isAdmin: actor.isAdmin ?? undefined,
    }))
  )
    return { response: forbidden() } as const;

  const stack = await db.query.prStacks.findFirst({
    where: and(
      eq(schema.prStacks.id, stackId),
      eq(schema.prStacks.repositoryId, repo.id),
    ),
  });
  if (!stack) return { response: notFound("Stack not found") } as const;

  return { response: null, stackId } as const;
}

export const GET: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const actor = await resolveActor(db, request, locals.user);
    if (!actor) return unauthorized();

    const resolved = await resolveContext(params, actor);
    if (resolved.response || !resolved.stackId) {
      return resolved.response || badRequest("Invalid request");
    }

    const status = await stackNeedsRebase(resolved.stackId);
    return success({
      ...status,
      upToDate: !status.needsRebase,
    });
  },
);

export const POST: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const actor = await resolveActor(db, request, locals.user);
    if (!actor) return unauthorized();

    const resolved = await resolveContext(params, actor);
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
  },
);
