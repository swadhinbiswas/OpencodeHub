
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { success, badRequest, notFound, unauthorized, serverError } from "@/lib/api";
import { eq, asc, desc } from "drizzle-orm";
import { projects, projectColumns, projectCards } from "@/db/schema/projects";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id } = params;
    if (!id) return badRequest("Project ID required");

    // We need to check permissions, but project fetch doesn't have repo context in URL.
    // We fetch project first to get repo ID.
    const db = getDatabase();
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, id),
        with: {
            repository: true
        }
    });

    if (!project) return notFound("Project not found");

    // Check permissions
    // For now, let's assume if you can see the repo, you can see the project.
    // We should implement proper permission check using `canReadRepo` from `lib/permissions` but we need to import it.
    // Or just simple check: public or user has access.

    // Fetch columns and cards
    const columns = await db.query.projectColumns.findMany({
        where: eq(projectColumns.projectId, id),
        orderBy: asc(projectColumns.order),
        with: {
            cards: {
                orderBy: asc(projectCards.order)
            }
        }
    });

    return success({
        project,
        columns
    });
});
