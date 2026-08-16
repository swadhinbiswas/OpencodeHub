import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { forbidden, parseBody, success, unauthorized, badRequest, notFound } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";
import { createChangeSet } from "@/lib/dependency-awareness";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(600).optional(),
  items: z
    .array(
      z.object({
        owner: z.string().min(1),
        repo: z.string().min(1),
        prNumber: z.number().int().positive().optional(),
      })
    )
    .min(1),
});

async function resolveRepo(owner: string, repo: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repoOwner = await db.query.users.findFirst({ where: eq(schema.users.username, owner) });
  if (!repoOwner) return null;
  return db.query.repositories.findFirst({
    where: and(eq(schema.repositories.ownerId, repoOwner.id), eq(schema.repositories.name, repo)),
  });
}

export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const sets =
    (await db.query.changeSets?.findMany({
      where: eq(schema.changeSets.createdById, user.userId),
      orderBy: [desc(schema.changeSets.createdAt)],
      limit: 100,
    })) || [];
  return success(sets);
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const items: { repositoryId: string; pullRequestId?: string }[] = [];

  for (const input of parsed.data.items) {
    const repo = await resolveRepo(input.owner, input.repo);
    if (!repo) return notFound(`Repository not found: ${input.owner}/${input.repo}`);
    if (!(await canWriteRepo(user.userId, repo, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
      return forbidden(`No write access to ${input.owner}/${input.repo}`);
    }

    let pullRequestId: string | undefined;
    if (input.prNumber) {
      const pr = await db.query.pullRequests.findFirst({
        where: and(
          eq(schema.pullRequests.repositoryId, repo.id),
          eq(schema.pullRequests.number, input.prNumber)
        ),
      });
      if (!pr) return badRequest(`PR #${input.prNumber} not found in ${input.owner}/${input.repo}`);
      pullRequestId = pr.id;
    }

    items.push({ repositoryId: repo.id, pullRequestId });
  }

  const created = await createChangeSet({
    name: parsed.data.name,
    description: parsed.data.description,
    createdById: user.userId,
    repositories: items,
  });
  return success(created);
});
