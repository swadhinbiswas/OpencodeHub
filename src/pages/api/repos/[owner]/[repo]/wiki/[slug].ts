
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { getUserFromRequest, getRepoAndUser } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, serverError } from "@/lib/api";
import { wikiPages, wikiRevisions } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// GET: Get wiki page details
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
            ),
            with: {
                lastEditor: true
            }
        });

        if (!page) return notFound("Wiki page not found");

        return success({ page });

    } catch (error) {
        logger.error({ err: error }, "Failed to get wiki page");
        return serverError("Failed to get wiki page");
    }
};

// PATCH: Update wiki page
export const PATCH: APIRoute = async ({ request, params }) => {
    try {
        const { owner, repo, slug } = params;
        if (!owner || !repo || !slug) return badRequest("Missing parameters");

        const user = await getUserFromRequest(request);
        if (!user) return unauthorized();

        // Cast db to NodePgDatabase to fix type errors with transaction
        const db = getDatabase() as NodePgDatabase<typeof schema>;
        const repoData = await getRepoAndUser(request, owner, repo);

        if (!repoData) return notFound("Repository not found");
        // Write access required
        if (repoData.permission !== "admin" && repoData.permission !== "write") {
            return unauthorized("Write access required");
        }

        const body = await request.json();
        const { content, message } = body;

        if (!content) return badRequest("Content is required");

        const page = await db.query.wikiPages.findFirst({
            where: and(
                eq(wikiPages.repositoryId, repoData.repository.id),
                eq(wikiPages.slug, slug)
            )
        });

        if (!page) return notFound("Wiki page not found");

        // Transaction to update page and add revision
        const newRevisionId = crypto.randomUUID();

        await db.transaction(async (tx) => {
            await tx.update(wikiPages)
                .set({
                    content,
                    lastEditorId: user.userId,
                    updatedAt: new Date()
                })
                .where(eq(wikiPages.id, page.id));

            await tx.insert(wikiRevisions).values({
                id: newRevisionId,
                pageId: page.id,
                content,
                authorId: user.userId,
                message: message || "Updated page"
            });
        });

        logger.info({ userId: user.userId, pageId: page.id }, "Wiki page updated");

        return success({ message: "Page updated successfully" });

    } catch (error) {
        logger.error({ err: error }, "Failed to update wiki page");
        return serverError("Failed to update wiki page");
    }
};
