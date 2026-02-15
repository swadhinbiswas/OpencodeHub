
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { getRepoAndUser } from "@/lib/auth";
import { success, notFound, serverError, badRequest } from "@/lib/api";
import { wikiPages, wikiRevisions } from "@/db/schema";
import { logger } from "@/lib/logger";

export const GET: APIRoute = async ({ request, params }) => {
    try {
        const { owner, repo, slug } = params;
        if (!owner || !repo || !slug) return badRequest("Missing parameters");

        const db = getDatabase();
        const repoData = await getRepoAndUser(request, owner, repo);

        if (!repoData) return notFound("Repository not found");
        if (repoData.permission === "none") return notFound("Repository not found");

        const page = await db.query.wikiPages.findFirst({
            where: and(
                eq(wikiPages.repositoryId, repoData.repository.id),
                eq(wikiPages.slug, slug)
            )
        });

        if (!page) return notFound("Wiki page not found");

        const revisions = await db.query.wikiRevisions.findMany({
            where: eq(wikiRevisions.pageId, page.id),
            orderBy: desc(wikiRevisions.createdAt),
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

        return success({ revisions });

    } catch (error) {
        logger.error({ err: error }, "Failed to get wiki revisions");
        return serverError("Failed to get wiki revisions");
    }
};
