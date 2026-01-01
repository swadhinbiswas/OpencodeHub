
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { canWriteRepo } from "@/lib/permissions";
import { eq, and } from "drizzle-orm";

export const DELETE: APIRoute = async ({ params, locals }) => {
    const { repoId, id } = params; // id is webhookId from file path logic if mapped correctly, but here we are in [repoId]/webhooks/[id].ts. Wait, previous file was index.ts. I need a new file.
    // Actually, I am creating `src/pages/api/repos/[repoId]/webhooks/[id].ts`

    const user = locals.user;
    if (!user || !repoId || !id) return new Response("Unauthorized", { status: 401 });

    const db = getDatabase();
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repoId),
    });

    if (!repo) return new Response("Not Found", { status: 404 });
    if (!await canWriteRepo(user.id, repo)) return new Response("Forbidden", { status: 403 });

    try {
        const webhook = await db.query.webhooks.findFirst({
            where: and(
                eq(schema.webhooks.id, id),
                eq(schema.webhooks.repositoryId, repoId)
            )
        });

        if (!webhook) return new Response("Not Found", { status: 404 });

        await db.delete(schema.webhooks).where(eq(schema.webhooks.id, id));

        return new Response(null, { status: 204 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
