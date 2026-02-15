
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, desc } from "drizzle-orm";
import { canAdminRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";

export const GET: APIRoute = async ({ params, locals }) => {
    const { owner, repo } = params;
    const db = getDatabase();

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

    const fields = await db.query.customFieldDefinitions.findMany({
        where: eq(schema.customFieldDefinitions.repositoryId, repository.id),
        orderBy: [desc(schema.customFieldDefinitions.createdAt)]
    });

    return new Response(JSON.stringify(fields), {
        headers: { "Content-Type": "application/json" }
    });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
    const { owner, repo } = params;
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
    const { name, type, description, options, required } = body;

    if (!name || !type) {
        return new Response("Missing required fields", { status: 400 });
    }

    const newField = await db.insert(schema.customFieldDefinitions).values({
        id: generateId(),
        repositoryId: repository.id,
        name,
        type,
        description,
        options, // JSON
        required: required || false,
    }).returning();

    return new Response(JSON.stringify(newField[0]), {
        headers: { "Content-Type": "application/json" }
    });
};
