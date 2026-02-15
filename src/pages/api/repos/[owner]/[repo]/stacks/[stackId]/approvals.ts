import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, inArray } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, notFound, success, unauthorized, forbidden } from "@/lib/api";
import { getStackApprovalStatus, requestStackApproval } from "@/lib/stack-approvals";

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName, stackId } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!ownerName || !repoName || !stackId) return badRequest("Missing parameters");

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

    const stack = await db.query.prStacks.findFirst({
        where: and(
            eq(schema.prStacks.id, stackId),
            eq(schema.prStacks.repositoryId, repo.id)
        ),
    });

    if (!stack) return notFound("Stack not found");

    const status = await getStackApprovalStatus(stackId);
    if (!status) return notFound("Stack not found");

    return success({ status });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName, stackId } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!ownerName || !repoName || !stackId) return badRequest("Missing parameters");

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
    if (!(await canWriteRepo(user.id, repo))) return forbidden();

    const stack = await db.query.prStacks.findFirst({
        where: and(
            eq(schema.prStacks.id, stackId),
            eq(schema.prStacks.repositoryId, repo.id)
        ),
    });

    if (!stack) return notFound("Stack not found");

    const body = await request.json();
    const reviewers = Array.isArray(body?.reviewers) ? body.reviewers : [];
    if (reviewers.length === 0) return badRequest("No reviewers provided");

    const users = await db.query.users.findMany({
        where: inArray(schema.users.username, reviewers),
        columns: { id: true, username: true },
    });

    if (users.length === 0) return badRequest("Reviewers not found");

    const reviewerIds = users.map((u) => u.id);
    const ok = await requestStackApproval(stackId, reviewerIds);

    if (!ok) return badRequest("Failed to request stack approvals");

    return success({ requested: users.map((u) => u.username) });
});
