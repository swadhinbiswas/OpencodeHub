import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { syncMirrorRepository } from "@/lib/mirror-sync";
import { pushMirrorNow } from "@/lib/push-mirror";

async function resolveRepository(owner: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return null;
  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repoName)
    ),
  });
}

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(user.userId, repository, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
    return forbidden();
  }

  const direction = new URL(request.url).searchParams.get("direction") ?? "pull";
  if (!["pull", "push", "both"].includes(direction)) {
    return badRequest("direction must be one of: pull, push, both");
  }

  if (direction === "push") {
    const pushResult = await pushMirrorNow(repository.id);
    if (!pushResult.success) {
      return badRequest(pushResult.error || "Push mirror failed");
    }
    return success({ direction, ...pushResult });
  }

  const result = await syncMirrorRepository(repository.id);
  if (!result.success) {
    return badRequest(result.error || "Mirror sync failed");
  }

  if (direction === "both") {
    const pushResult = await pushMirrorNow(repository.id);
    return success({
      direction,
      pull: result,
      push: pushResult,
    });
  }

  return success(result);
});

