import { getDatabase, schema } from "@/db";
import {
  badRequest,
  forbidden,
  notFound,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { bulkMergeStack } from "@/lib/bulk-merge";
import { withErrorHandler } from "@/lib/errors";
import { canAdminRepo, canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

const mergeStackSchema = z.object({
  mergeMethod: z.enum(["merge", "squash", "rebase"]).optional(),
  skipApprovalCheck: z.boolean().optional(),
});

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

    const body = await request.json().catch(() => null);
    const parsed = mergeStackSchema.safeParse(body || {});
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message || "Invalid merge payload",
      );
    }
    if (parsed.data.skipApprovalCheck) {
      const isRepoAdmin = await canAdminRepo(actor.id, repo, {
        isAdmin: actor.isAdmin ?? undefined,
      });
      if (!isRepoAdmin) {
        return forbidden("Only repository admins can skip approval checks");
      }
    }

    const result = await bulkMergeStack(stackId, actor.id, {
      mergeMethod: parsed.data.mergeMethod,
      skipApprovalCheck: parsed.data.skipApprovalCheck,
    });

    return success(result);
  },
);
