import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { canAdminRepo, canWriteRepo } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, notFound, success, unauthorized, forbidden } from "@/lib/api";
import { bulkMergeStack } from "@/lib/bulk-merge";

const mergeStackSchema = z.object({
  mergeMethod: z.enum(["merge", "squash", "rebase"]).optional(),
  skipApprovalCheck: z.boolean().optional(),
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const { owner: ownerName, repo: repoName, stackId } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!ownerName || !repoName || !stackId) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const owner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!owner) return notFound("Repository not found");

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, owner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repo) return notFound("Repository not found");
  if (!(await canWriteRepo(user.id, repo))) return forbidden();

  const stack = await db.query.prStacks.findFirst({
    where: and(
      eq(schema.prStacks.id, stackId),
      eq(schema.prStacks.repositoryId, repo.id)
    ),
  });
  if (!stack) return notFound("Stack not found");

  const body = await request.json().catch(() => null);
  const parsed = mergeStackSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid merge payload");
  }
  if (parsed.data.skipApprovalCheck) {
    const isRepoAdmin = await canAdminRepo(user.id, repo);
    if (!isRepoAdmin) {
      return forbidden("Only repository admins can skip approval checks");
    }
  }

  const result = await bulkMergeStack(stackId, user.id, {
    mergeMethod: parsed.data.mergeMethod,
    skipApprovalCheck: parsed.data.skipApprovalCheck,
  });

  return success(result);
});
