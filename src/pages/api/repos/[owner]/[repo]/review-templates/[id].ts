import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canAdminRepo } from "@/lib/permissions";

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

export const PUT: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { owner, repo, id } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!owner || !repo || !id) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepository(owner, repo);

    if (!repository) return notFound("Repository not found");

    if (!(await canAdminRepo(user.id, repository))) {
        return forbidden();
    }

    const body = await request.json();
    const { name, content, description, category, isDefault } = body || {};

    if (isDefault === true) {
        await db.update(schema.reviewTemplates)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(eq(schema.reviewTemplates.repositoryId, repository.id));
    }

    const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (content !== undefined) updateData.content = content;
    if (description !== undefined) updateData.description = description ?? null;
    if (category !== undefined) updateData.category = category ?? null;
    if (isDefault !== undefined) updateData.isDefault = !!isDefault;

    await db.update(schema.reviewTemplates)
        .set(updateData)
        .where(and(
            eq(schema.reviewTemplates.id, id),
            eq(schema.reviewTemplates.repositoryId, repository.id)
        ));

    return success({ success: true });
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner, repo, id } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!owner || !repo || !id) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepository(owner, repo);

    if (!repository) return notFound("Repository not found");

    if (!(await canAdminRepo(user.id, repository))) {
        return forbidden();
    }

    await db.delete(schema.reviewTemplates)
        .where(and(
            eq(schema.reviewTemplates.id, id),
            eq(schema.reviewTemplates.repositoryId, repository.id)
        ));

    return success({ success: true });
});
