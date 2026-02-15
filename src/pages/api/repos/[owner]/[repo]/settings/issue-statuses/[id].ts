import type { APIRoute, APIContext } from "astro";
import { getDatabase, schema } from "@/db";
import { withErrorHandler, success, badRequest, unauthorized, notFound } from "@/lib/api";
import { eq, and } from "drizzle-orm";

export const PUT: APIRoute = withErrorHandler(async ({ params, request, locals }: APIContext) => {
    const { repo, user } = locals as any;
    const { id } = params;
    const db = getDatabase();

    if (!id) return badRequest("Status ID is required");

    const permissions = await import("@/lib/permissions").then(m => m.getRepoPermission(user.id, repo));
    if (permissions !== "admin") {
        return unauthorized("You must be an admin to manage issue statuses");
    }

    const body = await request.json();
    const { name, color, type, order, isDefault } = body;

    const existing = await db.query.issueStatuses.findFirst({
        where: and(
            eq(schema.issueStatuses.id, id),
            eq(schema.issueStatuses.repositoryId, repo.id)
        ),
    });

    if (!existing) return notFound("Status not found");

    if (isDefault) {
        // Reset other defaults
        await (db as any).update(schema.issueStatuses)
            .set({ isDefault: 0 })
            .where(eq(schema.issueStatuses.repositoryId, repo.id));
    }

    const [updated] = await (db as any).update(schema.issueStatuses)
        .set({
            name: name ?? existing.name,
            color: color ?? existing.color,
            type: type ?? existing.type,
            order: order ?? existing.order,
            isDefault: isDefault ? 1 : existing.isDefault,
            updatedAt: new Date(),
        })
        .where(eq(schema.issueStatuses.id, id))
        .returning();

    return success(updated);
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }: APIContext) => {
    const { repo, user } = locals as any;
    const { id } = params;
    const db = getDatabase();

    if (!id) return badRequest("Status ID is required");

    const permissions = await import("@/lib/permissions").then(m => m.getRepoPermission(user.id, repo));
    if (permissions !== "admin") {
        return unauthorized("You must be an admin to manage issue statuses");
    }

    const existing = await db.query.issueStatuses.findFirst({
        where: and(
            eq(schema.issueStatuses.id, id),
            eq(schema.issueStatuses.repositoryId, repo.id)
        ),
    });

    if (!existing) return notFound("Status not found");

    // Check usage
    const used = await db.query.issues.findFirst({
        where: eq(schema.issues.statusId, id),
    });

    if (used) {
        return badRequest("Cannot delete status that is assigned to issues");
    }

    await (db as any).delete(schema.issueStatuses).where(eq(schema.issueStatuses.id, id));

    return success({ success: true });
});
