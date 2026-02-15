
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { canAdminRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";
import { z } from "zod";

export const GET: APIRoute = async ({ params, request, locals }) => {
    const { owner, repo } = params;
    const db = getDatabase();

    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repo!),
            eq(schema.repositories.ownerId, (await db.query.users.findFirst({
                where: eq(schema.users.username, owner!)
            }))?.id || "")
        )
    });

    if (!repository) return new Response("Repository not found", { status: 404 });

    const states = await db.query.prStateDefinitions.findMany({
        where: eq(schema.prStateDefinitions.repositoryId, repository.id),
        orderBy: (states, { asc }) => [asc(states.order)]
    });

    return new Response(JSON.stringify(states), {
        headers: { "Content-Type": "application/json" }
    });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
    const { owner, repo } = params;
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

    try {
        const body = await request.json();
        const name = z.string().min(1).parse(body.name);
        const description = z.string().optional().parse(body.description);

        const id = generateId("prstate");
        const count = await db.$count(schema.prStateDefinitions, eq(schema.prStateDefinitions.repositoryId, repository.id));

        // @ts-expect-error - Drizzle union type mismatch
        const [newState] = await db.insert(schema.prStateDefinitions).values({
            id,
            repositoryId: repository.id,
            name: name.toLowerCase().replace(/ /g, "_"),
            displayName: name,
            description,
            order: count,
            color: "#808080", // Default gray
        }).returning();

        return new Response(JSON.stringify(newState), { status: 201 });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400 });
    }
};
