import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { canReadRepo } from "@/lib/permissions";
import { detectBranchDependencies, getDependencyGraph } from "@/lib/pr-dependencies";

export const GET: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const user = locals.user;
  const { owner: ownerName, repo: repoName } = params;

  if (!user) return unauthorized();
  if (!ownerName || !repoName) return badRequest("Missing parameters");

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

  const url = new URL(request.url);
  const includeFiles = url.searchParams.get("includeFiles") !== "false";
  const graph = includeFiles
    ? await getDependencyGraph(repo.id)
    : await detectBranchDependencies(repo.id);

  return success({
    repositoryId: repo.id,
    includeFiles,
    graph,
  });
});

