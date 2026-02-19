import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { canReadRepo } from "@/lib/permissions";
import { suggestStackOrder } from "@/lib/pr-dependencies";

const stackOrderSchema = z.object({
  prIds: z.array(z.string().min(1)).min(2).max(100),
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const user = locals.user;
  const { owner: ownerName, repo: repoName } = params;

  if (!user) return unauthorized();
  if (!ownerName || !repoName) return badRequest("Missing parameters");

  const parsed = stackOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid stack ordering payload");
  }

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
  if (!(await canReadRepo(user.id, repo))) return notFound("Repository not found");

  const prs = await db.query.pullRequests.findMany({
    where: inArray(schema.pullRequests.id, parsed.data.prIds),
    columns: { id: true, repositoryId: true },
  });
  if (prs.length !== parsed.data.prIds.length) {
    return badRequest("One or more PR IDs were not found");
  }
  if (prs.some((pr) => pr.repositoryId !== repo.id)) {
    return badRequest("All PR IDs must belong to the target repository");
  }

  const suggestion = await suggestStackOrder(parsed.data.prIds);
  return success(suggestion);
});

