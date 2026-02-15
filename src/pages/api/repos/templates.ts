import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, or } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { repositories } from "@/db/schema";
import { getUserFromRequest } from "@/lib/auth";
import { success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";

export const GET: APIRoute = withErrorHandler(async ({ request }) => {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const tokenPayload = await getUserFromRequest(request);

    const conditions = [eq(repositories.isTemplate, true)];

    if (!tokenPayload) {
        conditions.push(eq(repositories.visibility, "public"));
    } else if (!tokenPayload.isAdmin) {
        conditions.push(
            or(
                eq(repositories.visibility, "public"),
                eq(repositories.visibility, "internal"),
                eq(repositories.ownerId, tokenPayload.userId)
            )
        );
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
