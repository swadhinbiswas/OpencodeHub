import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { suggestStackOrder } from "@/lib/pr-dependencies";
import { createStack } from "@/lib/stacks";
import { generateId } from "@/lib/utils";
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

const stackOrderSchema = z.object({
  prIds: z.array(z.string().min(1)).min(2).max(100),
});

async function resolveRepo(ownerName: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const owner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!owner) return null;

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, owner.id),
      eq(schema.repositories.name, repoName),
    ),
  });
  if (!repo) return null;
  return { owner, repo };
}

async function resolveActor(
  db: NodePgDatabase<typeof schema>,
  request: Request,
  localUser: { id: string; isAdmin?: boolean | null } | null | undefined,
) {
  if (localUser?.id) {
    return localUser;
  }

  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return null;
  }

  return db.query.users.findFirst({
    where: eq(schema.users.id, tokenPayload.userId),
    columns: { id: true, isAdmin: true },
  });
}

export const POST: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName } = params;

    if (!ownerName || !repoName) return badRequest("Missing parameters");

    const parsed = stackOrderSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message || "Invalid stack ordering payload",
      );
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const actor = await resolveActor(db, request, locals.user);
    if (!actor) return unauthorized();

    const resolved = await resolveRepo(ownerName, repoName);
    if (!resolved) return notFound("Repository not found");
    if (!(await canReadRepo(actor.id, resolved.repo)))
      return notFound("Repository not found");

    const prs = await db.query.pullRequests.findMany({
      where: inArray(schema.pullRequests.id, parsed.data.prIds),
      columns: { id: true, repositoryId: true },
    });
    if (prs.length !== parsed.data.prIds.length) {
      return badRequest("One or more PR IDs were not found");
    }
    if (prs.some((pr) => pr.repositoryId !== resolved.repo.id)) {
      return badRequest("All PR IDs must belong to the target repository");
    }

    const suggestion = await suggestStackOrder(parsed.data.prIds);
    return success(suggestion);
  },
);

const applyStackOrderSchema = z.object({
  prIds: z.array(z.string().min(1)).min(2).max(100),
  name: z.string().max(200).optional(),
});

export const PUT: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName } = params;

    if (!ownerName || !repoName) return badRequest("Missing parameters");

    const parsed = applyStackOrderSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message || "Invalid stack apply payload",
      );
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const actor = await resolveActor(db, request, locals.user);
    if (!actor) return unauthorized();

    const resolved = await resolveRepo(ownerName, repoName);
    if (!resolved) return notFound("Repository not found");
    if (
      !(await canWriteRepo(actor.id, resolved.repo, {
        isAdmin: actor.isAdmin ?? undefined,
      }))
    )
      return notFound("Repository not found");

    const prs = await db.query.pullRequests.findMany({
      where: inArray(schema.pullRequests.id, parsed.data.prIds),
      columns: {
        id: true,
        number: true,
        title: true,
        state: true,
        repositoryId: true,
        baseBranch: true,
      },
    });
    if (prs.length !== parsed.data.prIds.length) {
      return badRequest("One or more PR IDs were not found");
    }
    if (prs.some((pr) => pr.repositoryId !== resolved.repo.id)) {
      return badRequest("All PR IDs must belong to the target repository");
    }
    if (prs.some((pr) => pr.state !== "open")) {
      return badRequest("Only open pull requests can be applied to a stack");
    }

    const suggestion = await suggestStackOrder(parsed.data.prIds);
    if (suggestion.cycles.length > 0) {
      return badRequest(
        "Cannot apply stack order when dependency cycles are detected",
      );
    }

    const orderedPrIds = parsed.data.prIds;
    if (orderedPrIds.length < 2) {
      return badRequest("At least two PRs are required for stack creation");
    }

    const byId = new Map(prs.map((pr) => [pr.id, pr]));
    const orderedPrs = orderedPrIds.map((id) => byId.get(id)).filter(Boolean);
    if (orderedPrs.length !== orderedPrIds.length) {
      return badRequest("Suggested order contains unknown pull requests");
    }

    const existingEntries = await db.query.prStackEntries.findMany({
      where: inArray(schema.prStackEntries.pullRequestId, orderedPrIds),
      columns: { id: true, stackId: true, pullRequestId: true },
    });

    if (existingEntries.length > 0) {
      const existingStackIds = [
        ...new Set(existingEntries.map((entry) => entry.stackId)),
      ];
      const repoStacks = await db.query.prStacks.findMany({
        where: and(
          eq(schema.prStacks.repositoryId, resolved.repo.id),
          inArray(schema.prStacks.id, existingStackIds),
        ),
        columns: { id: true },
      });
      const repoStackIds = new Set(repoStacks.map((stack) => stack.id));
      const entryIdsToDelete = existingEntries
        .filter((entry) => repoStackIds.has(entry.stackId))
        .map((entry) => entry.id);

      if (entryIdsToDelete.length > 0) {
        await db
          .delete(schema.prStackEntries)
          .where(inArray(schema.prStackEntries.id, entryIdsToDelete));
      }
    }

    const baseBranch = orderedPrs[0]!.baseBranch;
    const stack = await createStack({
      repositoryId: resolved.repo.id,
      baseBranch,
      name: parsed.data.name || `Dependency stack (${orderedPrs.length} PRs)`,
      createdById: actor.id,
    });

    for (let index = 0; index < orderedPrIds.length; index++) {
      const pullRequestId = orderedPrIds[index];
      const parentPrId = index === 0 ? null : orderedPrIds[index - 1];

      await db.insert(schema.prStackEntries).values({
        id: generateId(),
        stackId: stack.id,
        pullRequestId,
        stackOrder: index + 1,
        parentPrId,
        createdAt: new Date(),
      });
    }

    return success({
      stackId: stack.id,
      stackName: stack.name,
      baseBranch: stack.baseBranch,
      order: orderedPrs.map((pr) => ({
        id: pr!.id,
        number: pr!.number,
        title: pr!.title,
      })),
    });
  },
);
