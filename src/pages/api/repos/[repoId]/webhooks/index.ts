
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { generateId } from "@/lib/utils";
import { canWriteRepo } from "@/lib/permissions";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ params, request, locals }) => {
    const { repoId } = params;
    const user = locals.user;

    if (!user || !repoId) return new Response("Unauthorized", { status: 401 });

    const db = getDatabase();
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repoId),
    });

    if (!repo) return new Response("Not Found", { status: 404 });
    if (!await canWriteRepo(user.id, repo)) return new Response("Forbidden", { status: 403 });

    try {
        const body = await request.json();
        const { url, secret, events, active, content_type } = body;

        if (!url || !events) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        const id = generateId();
        await db.insert(schema.webhooks).values({
            id,
            repositoryId: repoId,
            url,
            secret,
            events: JSON.stringify(events),
            active: active, // Changed from isActive
            // contentType: content_type // Add this to schema if needed, defaulting to json for now as it's not in my previous schema definition but was in plan
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        return new Response(JSON.stringify({ id }), { status: 201 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
