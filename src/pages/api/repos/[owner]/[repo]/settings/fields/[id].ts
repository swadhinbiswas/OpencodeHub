import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import { canAdminRepo } from "@/lib/permissions";

export const DELETE: APIRoute = async ({ params, locals }) => {
    const { owner, repo, id } = params;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repo!),
            eq(schema.repositories.ownerId, (
                await db.query.users.findFirst({
                    where: eq(schema.users.username, owner!)
                })
            )?.id || "")
        )
    });

    if (!repository) return new Response("Repo not found", { status: 404 });

    const hasAccess = await canAdminRepo(locals.user?.id, repository);
    if (!hasAccess) return new Response("Unauthorized", { status: 403 });

    await db.delete(schema.customFieldDefinitions)
        .where(and(
            eq(schema.customFieldDefinitions.id, id!),
            eq(schema.customFieldDefinitions.repositoryId, repository.id)
        ));

    return new Response(null, { status: 204 });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
    const { owner, repo, id } = params;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repo!),
            eq(schema.repositories.ownerId, (
                await db.query.users.findFirst({
                    where: eq(schema.users.username, owner!)
                })
            )?.id || "")
        )
    });

    if (!repository) return new Response("Repo not found", { status: 404 });

    const hasAccess = await canAdminRepo(locals.user?.id, repository);
    if (!hasAccess) return new Response("Unauthorized", { status: 403 });

    const body = await request.json();

    await db.update(schema.customFieldDefinitions)
        .set({
            ...body,
            updatedAt: new Date()
        })
        .where(and(
            eq(schema.customFieldDefinitions.id, id!),
            eq(schema.customFieldDefinitions.repositoryId, repository.id)
        ));

    return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
    });
};
