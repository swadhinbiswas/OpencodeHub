import type { APIRoute, APIContext } from "astro";
import { getDatabase, schema } from "@/db";
import { withErrorHandler, success, badRequest, unauthorized } from "@/lib/api";
import { eq, and, asc } from "drizzle-orm";
import { nanoid } from "nanoid";

export const GET: APIRoute = withErrorHandler(async ({ params, locals }: APIContext) => {
    const { repo } = locals as any;
    const db = getDatabase();

    const states = await db.query.prStateDefinitions.findMany({
        where: eq(schema.prStateDefinitions.repositoryId, repo.id),
        orderBy: asc(schema.prStateDefinitions.order),
    });

    return success(states);
});

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }: APIContext) => {
    const { repo, user } = locals as any;
    const db = getDatabase();

    // Check permissions (repo admin required)
    const permissions = await import("@/lib/permissions").then(m => m.getRepoPermission(user.id, repo));
    if (permissions !== "admin") {
        return unauthorized("You must be an admin to manage PR states");
    }

    const body = await request.json();
    const { name, displayName, color, description, icon, isFinal, allowMerge } = body;

    if (!name || !displayName) {
        return badRequest("Name and Display Name are required");
    }

    const id = nanoid();

    // Get current max order
    const existing = await db.query.prStateDefinitions.findFirst({
        where: eq(schema.prStateDefinitions.repositoryId, repo.id),
        orderBy: (states, { desc }) => [desc(states.order)],
    });
    const nextOrder = (existing?.order ?? 0) + 1;

    const [newState] = await (db as any).insert(schema.prStateDefinitions).values({
        id,
        repositoryId: repo.id,
        name,
        displayName,
        color: color || "#6B7280",
        description,
        icon,
        isFinal: isFinal || false,
        allowMerge: allowMerge || false,
        order: nextOrder,
    }).returning();

    return success(newState);
});
