import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { getLinkedCrossRepoIssues, linkCrossRepoIssues } from "@/lib/cross-repo-issues";

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

  const links = await getLinkedCrossRepoIssues(issue.id);
  const formatted = [] as Array<{
    id: string;
    linkType: string;
    issue: { id: string; number: number; title: string; state: string };
    repository: { id: string; name: string; owner: string };
  }>;

  for (const entry of links) {
    const ownerUser = await db.query.users.findFirst({
      where: eq(schema.users.id, entry.repository.ownerId),
      columns: { username: true },
    });

    formatted.push({
      id: entry.link.id,
      linkType: entry.link.linkType,
      issue: {
        id: entry.issue.id,
        number: entry.issue.number,
        title: entry.issue.title,
        state: entry.issue.state,
      },
      repository: {
        id: entry.repository.id,
        name: entry.repository.name,
        owner: ownerUser?.username || "",
      },
    });
  }

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

  const issue = await db.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.number, parseInt(number))
    ),
  });

  if (!issue) return notFound("Issue not found");

  const body = await request.json();
  const { target, linkType } = body || {};

  if (!target || typeof target !== "string") return badRequest("Missing target reference");

  const match = target.match(/^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)#(\d+)$/);
  if (!match) return badRequest("Target must be in owner/repo#number format");

  const targetOwner = match[1];
  const targetRepoName = match[2];
  const targetNumber = Number(match[3]);

  const targetRepoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, targetOwner),
  });

  if (!targetRepoOwner) return notFound("Target repository not found");

  const targetRepo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, targetRepoOwner.id),
      eq(schema.repositories.name, targetRepoName)
    ),
  });

  if (!targetRepo) return notFound("Target repository not found");

  if (!(await canReadRepo(user.id, targetRepo))) {
    return forbidden();
  }

  const targetIssue = await db.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, targetRepo.id),
      eq(schema.issues.number, targetNumber)
    ),
  });

  if (!targetIssue) return notFound("Target issue not found");

  const allowedTypes = new Set(["relates", "blocks", "blocked_by", "duplicates"]);
  const safeLinkType = allowedTypes.has(linkType) ? linkType : "relates";

  const link = await linkCrossRepoIssues({
    sourceIssueId: issue.id,
    targetIssueId: targetIssue.id,
    linkType: safeLinkType,
    createdById: user.id,
  });

  return success({
    link: {
      id: link.id,
      linkType: link.linkType,
      issue: {
        id: targetIssue.id,
        number: targetIssue.number,
        title: targetIssue.title,
        state: targetIssue.state,
      },
      repository: {
        id: targetRepo.id,
        name: targetRepo.name,
        owner: targetOwner,
      },
    },
  });
});
