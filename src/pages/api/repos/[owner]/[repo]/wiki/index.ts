
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { getUserFromRequest, getRepoAndUser } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, serverError } from "@/lib/api";
import { wikiPages, wikiRevisions } from "@/db/schema";
import { logger } from "@/lib/logger";
import { slugify } from "@/lib/utils";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// GET: List wiki pages
export const GET: APIRoute = async ({ request, params }) => {
    try {
        const { owner, repo } = params;
        if (!owner || !repo) return badRequest("Missing parameters");

        const db = getDatabase();
        const repoData = await getRepoAndUser(request, owner, repo);

        if (!repoData) return notFound("Repository not found");
        // Check read access (public repos are readable)
        if (repoData.permission === "none") return notFound("Repository not found");

        const pages = await db.query.wikiPages.findMany({
            where: eq(wikiPages.repositoryId, repoData.repository.id),
            orderBy: [desc(wikiPages.updatedAt)],
            columns: {
                id: true,
                slug: true,
                title: true,
                updatedAt: true
            }
        });

        return success({ pages });

    } catch (error) {
        logger.error({ err: error }, "Failed to list wiki pages");
        return serverError("Failed to list wiki pages");
    }
};

// POST: Create new wiki page
export const POST: APIRoute = async ({ request, params }) => {
    try {
        const { owner, repo } = params;
        if (!owner || !repo) return badRequest("Missing parameters");

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
        const { title, content } = body;

        if (!title || !content) return badRequest("Title and content are required");

        const slug = slugify(title);

        // Check for duplicate slug
        const existing = await db.query.wikiPages.findFirst({
            where: and(
                eq(wikiPages.repositoryId, repoData.repository.id),
                eq(wikiPages.slug, slug)
            )
        });

        if (existing) return badRequest("A page with this title already exists");

        // Transaction to create page and revision
        const newPageId = crypto.randomUUID();
        const newRevisionId = crypto.randomUUID();

        await db.transaction(async (tx) => {
            await tx.insert(wikiPages).values({
                id: newPageId,
                repositoryId: repoData.repository.id,
                slug,
                title,
                content,
                lastEditorId: user.userId,
            });

            await tx.insert(wikiRevisions).values({
                id: newRevisionId,
                pageId: newPageId,
                content,
                authorId: user.userId,
                message: "Created page"
            });
        });

        logger.info({ userId: user.userId, repoId: repoData.repository.id, slug }, "Wiki page created");

        return success({
            page: {
                id: newPageId,
                slug,
                title
            }
        });

    } catch (error) {
        logger.error({ err: error }, "Failed to create wiki page");
        return serverError("Failed to create wiki page");
    }
};
