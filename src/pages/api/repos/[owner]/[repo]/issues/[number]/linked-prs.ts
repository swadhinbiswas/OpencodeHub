import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, notFound, success } from "@/lib/api";
import { canReadRepo } from "@/lib/permissions";
import { getLinkedPRs } from "@/lib/pr-issue-linking";

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

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const { owner, repo, number } = params;

  if (!owner || !repo || !number) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(locals.user?.id, repository))) {
    return notFound("Repository not found");
  }

  const issue = await db.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.number, parseInt(number))
    ),
  });

  if (!issue) return notFound("Issue not found");

  const links = await getLinkedPRs(issue.id);

  const formatted = links.map((entry) => ({
    id: entry.link.id,
    linkType: entry.link.linkType,
    pullRequest: {
      id: entry.pr.id,
      number: entry.pr.number,
      title: entry.pr.title,
      state: entry.pr.state,
    },
  }));

  return success({ links: formatted });
});
