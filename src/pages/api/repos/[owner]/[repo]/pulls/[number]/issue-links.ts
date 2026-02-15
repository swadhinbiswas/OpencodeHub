import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { linkPRToIssue, getLinkedIssues } from "@/lib/pr-issue-linking";

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

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repository.id),
      eq(schema.pullRequests.number, parseInt(number))
    ),
  });

  if (!pr) return notFound("Pull request not found");

  const links = await getLinkedIssues(pr.id);
  const formatted = links.map((entry) => ({
    id: entry.link.id,
    linkType: entry.link.linkType,
    issue: {
      id: entry.issue.id,
      number: entry.issue.number,
      title: entry.issue.title,
      state: entry.issue.state,
    },
  }));

  return success({ links: formatted });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const { owner, repo, number } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repo || !number) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(user.id, repository))) {
    return forbidden();
  }

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repository.id),
      eq(schema.pullRequests.number, parseInt(number))
    ),
  });

  if (!pr) return notFound("Pull request not found");

  const body = await request.json();
  const { issueNumber, linkType } = body || {};

  if (!issueNumber) return badRequest("Missing issue number");

  const issue = await db.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.number, Number(issueNumber))
    ),
  });

  if (!issue) return notFound("Issue not found");

  const allowedTypes = new Set(["closes", "fixes", "relates", "blocks", "duplicates"]);
  const safeLinkType = allowedTypes.has(linkType) ? linkType : "relates";

  const link = await linkPRToIssue({
    pullRequestId: pr.id,
    issueId: issue.id,
    linkType: safeLinkType,
    createdById: user.id,
  });

  return success({
    link: {
      id: link.id,
      linkType: link.linkType,
      issue: {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        state: issue.state,
      },
    },
  });
});
