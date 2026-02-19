import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { canAdminRepo } from "@/lib/permissions";
import { badRequest, forbidden, notFound, success, unauthorized, withErrorHandler } from "@/lib/api";

async function resolveRepository(db: ReturnType<typeof getDatabase>, owner: string, repo: string) {
    const ownerUser = await db.query.users.findFirst({
        where: eq(schema.users.username, owner),
    });
    if (!ownerUser) return null;
    return db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repo),
            eq(schema.repositories.ownerId, ownerUser.id)
        ),
    });
}

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner, repo, id } = params;
    const db = getDatabase();
    const currentUser = locals.user;

    if (!currentUser) return unauthorized();
    if (!owner || !repo || !id) return badRequest("Missing parameters");
    const repository = await resolveRepository(db, owner, repo);
    if (!repository) return notFound("Repository not found");

    if (!await canAdminRepo(currentUser.id, repository)) {
        return forbidden();
    }

    const existing = await db.query.prStateDefinitions.findFirst({
        where: and(
            eq(schema.prStateDefinitions.id, id),
            eq(schema.prStateDefinitions.repositoryId, repository.id)
        ),
    });
    if (!existing) return notFound("State not found");

    const inUse = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.stateId, id),
        columns: { id: true },
    });
    if (inUse) {
        return badRequest("Cannot delete state that is currently assigned to pull requests");
    }

    // @ts-expect-error - Drizzle union type mismatch
    await db.delete(schema.prStateDefinitions)
        .where(and(
            eq(schema.prStateDefinitions.id, id),
            eq(schema.prStateDefinitions.repositoryId, repository.id)
        ));

    return success({ deleted: true });
});
