
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { success, badRequest, notFound, unauthorized, serverError } from "@/lib/api";
import { eq, and } from "drizzle-orm";
import { projectCards } from "@/db/schema/projects";
import { withErrorHandler } from "@/lib/errors";

export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id, cardId } = params;
    if (!id || !cardId) return badRequest("Project ID and Card ID required");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const db = getDatabase();

    // Verify ownership or permission (simplified for now)
    // In production, check if user has write access to project

    await (db as any).delete(projectCards)
        .where(eq(projectCards.id, cardId));

    return success({ message: "Card deleted" });
});

export const PATCH: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id, cardId } = params;
    if (!id || !cardId) return badRequest("Project ID and Card ID required");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const body = await request.json();
    const { note, contentId, contentType } = body;

    const db = getDatabase();

    const updates: any = {};
    if (note !== undefined) updates.note = note;
    if (contentId !== undefined) updates.contentId = contentId || null;
    if (contentType !== undefined) updates.contentType = contentType || null;

    if (Object.keys(updates).length === 0) return badRequest("No updates provided");

    const [updatedCard] = await (db as any).update(projectCards)
        .set(updates)
        .where(eq(projectCards.id, cardId))
        .returning();

    if (!updatedCard) return notFound("Card not found");

    return success(updatedCard);
});
