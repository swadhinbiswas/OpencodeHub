import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseQuery, success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { calculateFileHotspots, getFileHotspots } from "@/lib/analytics-advanced";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  recalculate: z.coerce.boolean().optional(),
});

async function resolveRepository(owner: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!repoOwner) return null;
  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, repoOwner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
}

export const GET: APIRoute = withErrorHandler(async ({ params, url, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const parsed = parseQuery(url, querySchema);
  if ("error" in parsed) return parsed.error;

  const user = locals.user;
  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user?.id, repository, { isAdmin: user?.isAdmin }))) {
    return notFound("Repository not found");
  }

  if (parsed.data.recalculate) {
    if (!(await canWriteRepo(user?.id, repository, { isAdmin: user?.isAdmin }))) {
      return forbidden("Write access required to recalculate hotspots");
    }
    const hotspots = await calculateFileHotspots(repository.id);
    return success(hotspots.slice(0, parsed.data.limit ?? 20));
  }

  const hotspots = await getFileHotspots(repository.id, parsed.data.limit ?? 20);
  return success(hotspots);
});
