import { getDatabase, schema } from "@/db";
import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";

export const DELETE: APIRoute = async ({ params }) => {
    const { repoId, id } = params;
    if (!repoId || !id) return new Response("IDs required", { status: 400 });

    const db = getDatabase();

    await db.delete(schema.branchProtection)
        .where(and(
            eq(schema.branchProtection.id, id),
            eq(schema.branchProtection.repositoryId, repoId)
        ));

    return new Response(null, { status: 204 });
};

export const PUT: APIRoute = async ({ params, request }) => {
    const { repoId, id } = params;
    if (!repoId || !id) return new Response("IDs required", { status: 400 });

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response("Invalid JSON", { status: 400 });
    }

    const db = getDatabase();

    await db.update(schema.branchProtection)
        .set({
            ...body,
            updatedAt: new Date().toISOString()
        })
        .where(and(
            eq(schema.branchProtection.id, id),
            eq(schema.branchProtection.repositoryId, repoId)
        ));

    return new Response(JSON.stringify({ success: true }), { status: 200 });
};
