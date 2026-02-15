import type { APIRoute, APIContext } from "astro";
import { getDatabase, schema } from "@/db";
import { withErrorHandler, success, badRequest, unauthorized, notFound } from "@/lib/api";
import { eq, and } from "drizzle-orm";

export const PUT: APIRoute = withErrorHandler(async ({ params, request, locals }: APIContext) => {
    const { repo, user } = locals as any;
    const { id } = params;
    const db = getDatabase();

    if (!id) return badRequest("State ID is required");

    // Check permissions
    const permissions = await import("@/lib/permissions").then(m => m.getRepoPermission(user.id, repo));
    if (permissions !== "admin") {
        return unauthorized("You must be an admin to manage PR states");
    }

    const body = await request.json();
    const { name, displayName, color, description, icon, isFinal, allowMerge, order } = body;

    const existing = await db.query.prStateDefinitions.findFirst({
        where: and(
            eq(schema.prStateDefinitions.id, id),
            eq(schema.prStateDefinitions.repositoryId, repo.id)
        ),
    });

    if (!existing) return notFound("State not found");

    const [updated] = await (db as any).update(schema.prStateDefinitions)
        .set({
            name: name ?? existing.name,
            displayName: displayName ?? existing.displayName,
            color: color ?? existing.color,
            description: description ?? existing.description,
            icon: icon ?? existing.icon,
            isFinal: isFinal ?? existing.isFinal,
            allowMerge: allowMerge ?? existing.allowMerge,
            order: order ?? existing.order,
            updatedAt: new Date(),
        })
        .where(eq(schema.prStateDefinitions.id, id))
        .returning();

    return success(updated);
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }: APIContext) => {
    const { repo, user } = locals as any;
    const { id } = params;
    const db = getDatabase();

    if (!id) return badRequest("State ID is required");

    // Check permissions
    const permissions = await import("@/lib/permissions").then(m => m.getRepoPermission(user.id, repo));
    if (permissions !== "admin") {
        return unauthorized("You must be an admin to manage PR states");
    }

    const existing = await db.query.prStateDefinitions.findFirst({
        where: and(
            eq(schema.prStateDefinitions.id, id),
            eq(schema.prStateDefinitions.repositoryId, repo.id)
        ),
    });

    if (!existing) return notFound("State not found");

    // Check if in use
    const used = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.stateId, id),
    });

    if (used) {
        return badRequest("Cannot delete state that is currently assigned to pull requests");
    }

    await (db as any).delete(schema.prStateDefinitions)
        .where(eq(schema.prStateDefinitions.id, id));

    return success({ success: true });
});
