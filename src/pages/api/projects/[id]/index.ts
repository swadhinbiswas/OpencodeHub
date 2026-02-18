
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { canReadRepo } from "@/lib/permissions";
import { success, badRequest, notFound, unauthorized, serverError } from "@/lib/api";
import { eq, asc, desc } from "drizzle-orm";
import { projects, projectColumns, projectCards } from "@/db/schema/projects";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id } = params;
    if (!id) return badRequest("Project ID required");
    const user = await getUserFromRequest(request);

    const db = getDatabase();
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, id),
        with: {
            repository: true
        }
    });

    if (!project) return notFound("Project not found");

    if (!(await canReadRepo(user?.userId, project.repository, { isAdmin: user?.isAdmin }))) {
        return notFound("Project not found");
    }

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
