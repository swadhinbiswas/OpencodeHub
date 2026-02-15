
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { success, badRequest, notFound, unauthorized, serverError } from "@/lib/api";
import { eq, desc } from "drizzle-orm";
import { projects, projectColumns } from "@/db/schema/projects";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id } = params; // project id
    if (!id) return badRequest("Project ID required");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const body = await request.json();
    const { name } = body;

    if (!name) return badRequest("Column name is required");

    const db = getDatabase();

    // Get max order
    const existing = await (db as any).select({ order: projectColumns.order })
        .from(projectColumns)
        .where(eq(projectColumns.projectId, id))
        .orderBy(desc(projectColumns.order))
        .limit(1);

    const nextOrder = (existing[0]?.order || 0) + 1;

    const [newColumn] = await (db as any).insert(projectColumns).values({
        id: crypto.randomUUID(),
        projectId: id,
        name,
        order: nextOrder,
    }).returning();

    return success(newColumn);
});
