
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { success, badRequest, notFound, unauthorized, serverError } from "@/lib/api";
import { eq, desc } from "drizzle-orm";
import { projects, projectColumns, projectCards } from "@/db/schema/projects";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id } = params; // project id
    if (!id) return badRequest("Project ID required");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const body = await request.json();
    const { columnId, note, contentId, contentType } = body;

    if (!columnId) return badRequest("Column ID is required");
    if (!note && !contentId) return badRequest("Note or content is required");

    const db = getDatabase();

    // Get max order
    const existing = await (db as any).select({ order: projectCards.order })
        .from(projectCards)
        .where(eq(projectCards.columnId, columnId))
        .orderBy(desc(projectCards.order))
        .limit(1);

    const nextOrder = (existing[0]?.order || 0) + 1;

    const [newCard] = await (db as any).insert(projectCards).values({
        id: crypto.randomUUID(),
        columnId,
        note,
        contentId,
        contentType,
        order: nextOrder,
        creatorId: user.id
    }).returning();

    return success(newCard);
});
