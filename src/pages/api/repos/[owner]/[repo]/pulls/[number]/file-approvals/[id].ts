import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { canAdminRepo } from "@/lib/permissions";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";

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

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, parseInt(number))
        ),
    });

    if (!pr) return notFound("Pull request not found");

    const approval = await db.query.fileApprovals.findFirst({
        where: and(
            eq(schema.fileApprovals.id, id),
            eq(schema.fileApprovals.pullRequestId, pr.id)
        ),
    });

    if (!approval) return notFound("Approval not found");

    const isAdmin = await canAdminRepo(user.id, repository, { isAdmin: user.isAdmin ?? undefined });

    if (!isAdmin && approval.approvedById !== user.id) {
        return forbidden();
    }

    await db.delete(schema.fileApprovals)
        .where(eq(schema.fileApprovals.id, id));

    return success({ success: true });
});
