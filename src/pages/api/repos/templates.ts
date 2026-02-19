import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { repositories, repositoryCollaborators, users } from "@/db/schema";
import { getUserFromRequest } from "@/lib/auth";
import { success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";

export const GET: APIRoute = withErrorHandler(async ({ request, url }) => {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const tokenPayload = await getUserFromRequest(request);

    const conditions: any[] = [eq(repositories.isTemplate, true)];
    const visibilityFilter = url.searchParams.get("visibility");
    const ownerFilter = url.searchParams.get("owner");
    const searchQuery = url.searchParams.get("q");

    if (!tokenPayload) {
        conditions.push(eq(repositories.visibility, "public"));
    } else if (!tokenPayload.isAdmin) {
        const collaboratorRows = await db.query.repositoryCollaborators.findMany({
            where: eq(repositoryCollaborators.userId, tokenPayload.userId),
            columns: { repositoryId: true },
        });
        const collaboratorRepoIds = collaboratorRows.map((row) => row.repositoryId);

        const accessClauses = [
            eq(repositories.visibility, "public"),
            eq(repositories.visibility, "internal"),
            eq(repositories.ownerId, tokenPayload.userId),
        ];
        if (collaboratorRepoIds.length > 0) {
            accessClauses.push(inArray(repositories.id, collaboratorRepoIds));
        }
        const visibilityOrOwner = or(
            ...accessClauses
        );
        if (visibilityOrOwner) {
            conditions.push(visibilityOrOwner);
        }
    }

    if (visibilityFilter && ["public", "private", "internal"].includes(visibilityFilter)) {
        conditions.push(eq(repositories.visibility, visibilityFilter as "public" | "private" | "internal"));
    }

    if (ownerFilter) {
        const ownerUser = await db.query.users.findFirst({
            where: eq(users.username, ownerFilter),
            columns: { id: true },
        });
        if (!ownerUser) return success({ templates: [] });
        conditions.push(eq(repositories.ownerId, ownerUser.id));
    }

    if (searchQuery) {
        const search = `%${searchQuery}%`;
        const nameOrDesc = or(
            like(repositories.name, search),
            like(repositories.description, search)
        );
        if (nameOrDesc) conditions.push(nameOrDesc);
    }

    const templates = await db.query.repositories.findMany({
        where: and(...conditions),
        orderBy: [desc(repositories.updatedAt)],
        with: {
            owner: {
                columns: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatarUrl: true,
                },
            },
        },
    });

    const data = templates.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: `${repo.owner.username}/${repo.name}`,
        description: repo.description,
        visibility: repo.visibility,
        defaultBranch: repo.defaultBranch,
        language: repo.language,
        updatedAt: repo.updatedAt,
        owner: repo.owner,
    }));

    return success({ templates: data });
});
