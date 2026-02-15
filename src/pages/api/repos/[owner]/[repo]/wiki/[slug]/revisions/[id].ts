
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getRepoAndUser } from "@/lib/auth";
import { success, notFound, serverError, badRequest } from "@/lib/api";
import { wikiRevisions } from "@/db/schema";
import { logger } from "@/lib/logger";

export const GET: APIRoute = async ({ request, params }) => {
    try {
        const { owner, repo, slug, id } = params;
        if (!owner || !repo || !slug || !id) return badRequest("Missing parameters");

        const db = getDatabase();
        const repoData = await getRepoAndUser(request, owner, repo);

        if (!repoData) return notFound("Repository not found");
        if (repoData.permission === "none") return notFound("Repository not found");

        const revision = await db.query.wikiRevisions.findFirst({
            where: eq(wikiRevisions.id, id),
            with: {
                author: {
                    columns: {
                        id: true,
                        username: true,
                        displayName: true,
                        avatarUrl: true
                    }
                }
            }
        });

        if (!revision) return notFound("Revision not found");

        return success({ revision });

    } catch (error) {
        logger.error({ err: error }, "Failed to get wiki revision");
        return serverError("Failed to get wiki revision");
    }
};
