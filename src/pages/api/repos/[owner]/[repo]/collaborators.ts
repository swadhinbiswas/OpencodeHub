import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { canAdminRepo } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, created, notFound, success, unauthorized, forbidden, parseBody } from "@/lib/api";
import { generateId } from "@/lib/utils";

const createCollaboratorSchema = z.object({
    username: z.string().min(1),
    role: z.enum(["maintainer", "developer", "guest"]).default("developer"),
});

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!ownerName || !repoName) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const owner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });

    if (!owner) return notFound("Repository not found");

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, owner.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repo) return notFound("Repository not found");
    if (!(await canAdminRepo(user.id, repo, { isAdmin: user.isAdmin }))) return forbidden();

    const collaborators = await db.query.repositoryCollaborators.findMany({
        where: eq(schema.repositoryCollaborators.repositoryId, repo.id),
        with: { user: true },
    });

    return success({ collaborators });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!ownerName || !repoName) return badRequest("Missing parameters");

    const parsed = await parseBody(request, createCollaboratorSchema);
    if ("error" in parsed) return parsed.error;

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const owner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });

    if (!owner) return notFound("Repository not found");

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, owner.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repo) return notFound("Repository not found");
    if (!(await canAdminRepo(user.id, repo, { isAdmin: user.isAdmin }))) return forbidden();

    const targetUser = await db.query.users.findFirst({
        where: eq(schema.users.username, parsed.data.username),
    });

    if (!targetUser) return badRequest("User not found");
    if (targetUser.id === repo.ownerId) return badRequest("Owner already has access");

    const existing = await db.query.repositoryCollaborators.findFirst({
        where: and(
            eq(schema.repositoryCollaborators.repositoryId, repo.id),
            eq(schema.repositoryCollaborators.userId, targetUser.id)
        ),
    });

    if (existing) return badRequest("User is already a collaborator");

    const collaborator = {
        id: generateId(),
        repositoryId: repo.id,
        userId: targetUser.id,
        role: parsed.data.role,
        addedById: user.id,
        createdAt: new Date(),
    };

    await db.insert(schema.repositoryCollaborators).values(collaborator);

    return created({ collaborator });
});
