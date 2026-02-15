
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { getRepoAndUser } from "@/lib/auth";
import { success, badRequest, serverError, unauthorized } from "@/lib/api";
import { eq, desc } from "drizzle-orm";
import { projects } from "@/db/schema/projects";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { owner, repo } = params;
    const repoInfo = await getRepoAndUser(request, owner!, repo!);

    if (!repoInfo) {
        return badRequest("Repository not found");
    }

    const { repository } = repoInfo;

    const db = getDatabase();

    const projectList = await (db as any).select()
        .from(projects)
        .where(eq(projects.repositoryId, repository.id))
        .orderBy(desc(projects.updatedAt));

    return success(projectList);
});

export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { owner, repo } = params;
    const repoInfo = await getRepoAndUser(request, owner!, repo!);

    if (!repoInfo) {
        return badRequest("Repository not found");
    }

    const { repository, user, permission } = repoInfo;

    if (permission === "read") {
        return unauthorized("Write access required to create projects");
    }

    try {
        const body = await request.json();
        const { name, description } = body;

        if (!name) {
            return badRequest("Project name is required");
        }

        const db = getDatabase();

        // Get max number
        const existing = await (db as any).select({ number: projects.number })
            .from(projects)
            .where(eq(projects.repositoryId, repository.id))
            .orderBy(desc(projects.number))
            .limit(1);

        const nextNumber = (existing[0]?.number || 0) + 1;

        const [newProject] = await (db as any).insert(projects).values({
            id: crypto.randomUUID(),
            repositoryId: repository.id,
            name,
            description,
            number: nextNumber,
            creatorId: user.id,
        }).returning();

        logger.info({ projectId: newProject.id, repoId: repository.id }, "Project created");

        return success(newProject);
    } catch (error) {
        logger.error(error as any, "Failed to create project");
        return serverError("Failed to create project");
    }
});
