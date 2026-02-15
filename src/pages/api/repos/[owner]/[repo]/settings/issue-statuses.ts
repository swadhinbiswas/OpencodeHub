import type { APIRoute, APIContext } from "astro";
import { getDatabase, schema } from "@/db";
import { withErrorHandler, success, badRequest, unauthorized } from "@/lib/api";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";

export const GET: APIRoute = withErrorHandler(async ({ params, locals }: APIContext) => {
    const { repo } = locals as any;
    const db = getDatabase();

    const statuses = await db.query.issueStatuses.findMany({
        where: eq(schema.issueStatuses.repositoryId, repo.id),
        orderBy: asc(schema.issueStatuses.order),
    });

    return success(statuses);
});

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }: APIContext) => {
    const { repo, user } = locals as any;
    const db = getDatabase();

    // Check permissions
    const permissions = await import("@/lib/permissions").then(m => m.getRepoPermission(user.id, repo));
    if (permissions !== "admin") {
        return unauthorized("You must be an admin to manage issue statuses");
    }

    const body = await request.json();
    const { name, color, type } = body;

    if (!name) {
        return badRequest("Name is required");
    }

    const id = nanoid();

    const existing = await db.query.issueStatuses.findFirst({
        where: eq(schema.issueStatuses.repositoryId, repo.id),
        orderBy: (statuses, { desc }) => [desc(statuses.order)],
    });
    const nextOrder = (existing?.order ?? 0) + 1;

    const [newStatus] = await (db as any).insert(schema.issueStatuses).values({
        id,
        repositoryId: repo.id,
        name,
        color: color || "#808080",
        type: type || "open", // open, completed, cancelled
        order: nextOrder,
    }).returning();

    return success(newStatus);
});
