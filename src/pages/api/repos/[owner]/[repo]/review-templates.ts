import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, created, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canAdminRepo, canReadRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";

async function getRepository(owner: string, repo: string) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const ownerUser = await db.query.users.findFirst({
        where: eq(schema.users.username, owner),
    });

    if (!ownerUser) return null;

    return db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, ownerUser.id),
            eq(schema.repositories.name, repo)
        ),
    });
}

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner, repo } = params;

    if (!owner || !repo) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepository(owner, repo);

    if (!repository) return notFound("Repository not found");

    if (!(await canReadRepo(locals.user?.id, repository))) {
        return notFound("Repository not found");
    }

    try {
        const templates = await db.query.reviewTemplates.findMany({
            where: eq(schema.reviewTemplates.repositoryId, repository.id),
            orderBy: [desc(schema.reviewTemplates.createdAt)],
        });

        return success({ templates });
    } catch (error) {
        return success({ templates: [] });
    }
});

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { owner, repo } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!owner || !repo) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepository(owner, repo);

    if (!repository) return notFound("Repository not found");

    if (!(await canAdminRepo(user.id, repository))) {
        return forbidden();
    }

    const body = await request.json();
    const { name, content, description, category, isDefault } = body || {};

    if (!name || !content) {
        return badRequest("Missing required fields");
    }

    if (isDefault) {
        await db.update(schema.reviewTemplates)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(eq(schema.reviewTemplates.repositoryId, repository.id));
    }

    const template = {
        id: generateId("review_template"),
        repositoryId: repository.id,
        name,
        content,
        description: description || null,
        category: category || null,
        isDefault: !!isDefault,
        createdById: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(schema.reviewTemplates).values(template);

    return created({ template });
});
