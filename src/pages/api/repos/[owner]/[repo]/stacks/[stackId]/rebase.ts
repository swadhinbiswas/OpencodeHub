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
import { rebaseStack, stackNeedsRebase } from "@/lib/stack-rebase";
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

export const POST: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName, stackId } = params;
    if (!ownerName || !repoName || !stackId)
      return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const actor = await resolveActor(db, request, locals.user);

    if (!actor) return unauthorized();

    const owner = await db.query.users.findFirst({
      where: eq(schema.users.username, ownerName),
    });

    if (!owner) return notFound("Repository not found");

    const repo = await db.query.repositories.findFirst({
      where: and(
        eq(schema.repositories.ownerId, owner.id),
        eq(schema.repositories.name, repoName),
      ),
    });

    if (!repo) return notFound("Repository not found");
    if (
      !(await canWriteRepo(actor.id, repo, {
        isAdmin: actor.isAdmin ?? undefined,
      }))
    )
      return forbidden();

    const stack = await db.query.prStacks.findFirst({
      where: and(
        eq(schema.prStacks.id, stackId),
        eq(schema.prStacks.repositoryId, repo.id),
      ),
    });

    if (!stack) return notFound("Stack not found");

    const status = await stackNeedsRebase(stackId);
    if (!status.needsRebase) {
      return success({
        needsRebase: false,
        behindBy: status.behindBy,
        message: "Stack is already up to date",
      });
    }

    const result = await rebaseStack(stackId);

    return success({
      needsRebase: status.needsRebase,
      behindBy: status.behindBy,
      result,
    });
  },
);
