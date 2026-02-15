import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canWriteRepo } from "@/lib/permissions";
import { unlinkCrossRepoIssues } from "@/lib/cross-repo-issues";

async function getRepository(owner: string, repo: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });

  if (!ownerUser) return null;

  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo)
    ),
  });
}

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const { owner, repo, number, id } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repo || !number || !id) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(user.id, repository))) {
    return forbidden();
  }

  const issue = await db.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.number, parseInt(number))
    ),
  });

  if (!issue) return notFound("Issue not found");

  const link = await db.query.crossRepoIssueLinks.findFirst({
    where: and(
      eq(schema.crossRepoIssueLinks.id, id),
      eq(schema.crossRepoIssueLinks.sourceIssueId, issue.id)
    ),
  });

  if (!link) return notFound("Link not found");

  const removed = await unlinkCrossRepoIssues(link.id);

  return success({ success: removed });
});
