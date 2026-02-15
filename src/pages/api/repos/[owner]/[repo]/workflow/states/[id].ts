import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { canAdminRepo } from "@/lib/permissions";

export const DELETE: APIRoute = async ({ params, request, locals }) => {
    const { owner, repo, id } = params;
    const db = getDatabase();
    const currentUser = locals.user;

    if (!currentUser) return new Response("Unauthorized", { status: 401 });

    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repo!),
            eq(schema.repositories.ownerId, (await db.query.users.findFirst({
                where: eq(schema.users.username, owner!)
            }))?.id || "")
        )
    });

    if (!repository) return new Response("Repository not found", { status: 404 });

    if (!await canAdminRepo(currentUser.id, repository)) {
        return new Response("Forbidden", { status: 403 });
    }

    // @ts-expect-error - Drizzle union type mismatch
    await db.delete(schema.prStateDefinitions)
        .where(and(
            eq(schema.prStateDefinitions.id, id!),
            eq(schema.prStateDefinitions.repositoryId, repository.id)
        ));

    return new Response(null, { status: 204 });
};
