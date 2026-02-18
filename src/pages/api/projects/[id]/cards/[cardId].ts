
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";
import { success, badRequest, notFound, unauthorized, serverError } from "@/lib/api";
import { eq } from "drizzle-orm";
import { projects, projectCards } from "@/db/schema/projects";
import { withErrorHandler } from "@/lib/errors";

export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id, cardId } = params;
    if (!id || !cardId) return badRequest("Project ID and Card ID required");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const db = getDatabase();

    const project = await db.query.projects.findFirst({
        where: eq(projects.id, id),
        with: { repository: true },
    });
    if (!project) return notFound("Project not found");

    if (!(await canWriteRepo(user.userId, project.repository, { isAdmin: user.isAdmin }))) {
        return unauthorized("Write access required");
    }

    const existingCard = await db.query.projectCards.findFirst({
        where: eq(projectCards.id, cardId),
        with: { column: true },
    });
    if (!existingCard || existingCard.column.projectId !== id) {
        return notFound("Card not found");
    }

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
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, id),
        with: { repository: true },
    });
    if (!project) return notFound("Project not found");

    if (!(await canWriteRepo(user.userId, project.repository, { isAdmin: user.isAdmin }))) {
        return unauthorized("Write access required");
    }

    const updates: any = {};
    if (note !== undefined) updates.note = note;
    if (contentId !== undefined) updates.contentId = contentId || null;
    if (contentType !== undefined) updates.contentType = contentType || null;

    if (Object.keys(updates).length === 0) return badRequest("No updates provided");

    const existingCard = await db.query.projectCards.findFirst({
        where: eq(projectCards.id, cardId),
        with: { column: true },
    });
    if (!existingCard || existingCard.column.projectId !== id) {
        return notFound("Card not found");
    }

    const [updatedCard] = await (db as any).update(projectCards)
        .set(updates)
        .where(eq(projectCards.id, cardId))
        .returning();

    if (!updatedCard) return notFound("Card not found");

    return success(updatedCard);
});
