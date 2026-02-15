
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { success, badRequest, notFound, unauthorized, serverError } from "@/lib/api";
import { eq, inArray } from "drizzle-orm";
import { projects, projectColumns, projectCards } from "@/db/schema/projects";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const PUT: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id } = params; // project id
    if (!id) return badRequest("Project ID required");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    // In real app, verify user has write access to project

    const body = await request.json();
    const { type, items, columnId } = body;

    const db = getDatabase();

    if (type === "column") {
        // Reorder columns
        // items is array of { id, order }
        const updates = items.map((item: any) =>
            (db as any).update(projectColumns)
                .set({ order: item.order })
                .where(eq(projectColumns.id, item.id))
        );
        await Promise.all(updates);
    } else if (type === "card") {
        // Reorder cards
        // items is array of { id, order, columnId }
        // if columnId is provided in body, it means we moved to a new column (or same)
        // But drag and drop might send a list of cards for a specific column.

        // Strategy: We receive a list of card IDs in their new order for a specific column.
        if (!columnId || !Array.isArray(items)) {
            return badRequest("Column ID and items array required for card reorder");
        }

        // Update all cards in the list to have the new order and new columnId
        const updates = items.map((cardId: string, index: number) =>
            (db as any).update(projectCards)
                .set({
                    order: index,
                    columnId: columnId
                })
                .where(eq(projectCards.id, cardId))
        );

        await Promise.all(updates);
    }

    return success({ message: "Updated" });
});
