import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canAdminRepo, canReadRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";

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
  const { owner, repo } = params;

  if (!owner || !repo) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(locals.user?.id, repository))) {
    return notFound("Repository not found");
  }

  const existing = await db.query.reviewRequirements.findFirst({
    where: eq(schema.reviewRequirements.repositoryId, repository.id),
  });

  if (!existing) {
    return success({
      requirements: {
        minApprovals: 1,
        requireCodeOwner: false,
        requireTeamLead: false,
        dismissStaleReviews: false,
        requireReReviewOnPush: false,
      },
    });
  }

  return success({ requirements: existing });
});

export const PUT: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const { owner, repo } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repo) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.id, repository))) {
    return forbidden();
  }

  const body = await request.json();
  const {
    minApprovals,
    requireCodeOwner,
    requireTeamLead,
    dismissStaleReviews,
    requireReReviewOnPush,
  } = body || {};

  const existing = await db.query.reviewRequirements.findFirst({
    where: eq(schema.reviewRequirements.repositoryId, repository.id),
  });

  const updateData = {
    minApprovals: typeof minApprovals === "number" ? minApprovals : existing?.minApprovals ?? 1,
    requireCodeOwner: !!requireCodeOwner,
    requireTeamLead: !!requireTeamLead,
    dismissStaleReviews: !!dismissStaleReviews,
    requireReReviewOnPush: !!requireReReviewOnPush,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(schema.reviewRequirements)
      .set(updateData)
      .where(eq(schema.reviewRequirements.id, existing.id));
  } else {
    await db.insert(schema.reviewRequirements).values({
      id: generateId("review_requirements"),
      repositoryId: repository.id,
      createdById: user.id,
      createdAt: new Date(),
      ...updateData,
    });
  }

  return success({ requirements: updateData });
});
