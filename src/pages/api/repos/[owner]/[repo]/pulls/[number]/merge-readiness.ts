import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import { evaluateGates } from "@/lib/ci-gates";

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const number = Number.parseInt(params.number || "", 10);
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repoName || Number.isNaN(number)) {
    return badRequest("Missing or invalid parameters");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("Repository not found");

  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return notFound("Repository not found");
  }

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repository.id),
      eq(schema.pullRequests.number, number)
    ),
    columns: {
      id: true,
      number: true,
      state: true,
      isDraft: true,
      mergeable: true,
      mergeableState: true,
    },
  });
  if (!pr) return notFound("Pull request not found");

  if (pr.state !== "open") {
    return success({
      canMerge: false,
      blockers: ["Pull request is not open"],
      gateResults: [],
      mergeable: pr.mergeable,
      mergeableState: pr.mergeableState,
    });
  }

  const gateResult = await evaluateGates(pr.id);
  const blockers = gateResult.results
    .filter((result) => !result.passed)
    .map((result) => result.message);

  return success({
    canMerge: gateResult.canMerge,
    blockers,
    gateResults: gateResult.results,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeableState,
  });
});
