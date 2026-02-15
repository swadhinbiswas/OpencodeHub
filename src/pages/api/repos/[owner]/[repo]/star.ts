
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logActivity } from "@/lib/activity";
import { generateId } from "@/lib/utils";

export const POST: APIRoute = async ({ params, request, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { owner, repo } = params;
    if (!owner || !repo) {
        return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    try {
        const db = getDatabase() as NodePgDatabase<typeof schema>;

        // Find repo
        const repository = await db.query.repositories.findFirst({
            where: and(
                eq(schema.repositories.slug, repo.toLowerCase()),
                // We need to join with owner to verify owner name, but slug should be unique per owner usually?
                // Actually slug is unique globally in some systems, but here it seems repo table has ownerId.
                // Let's look up owner first.
            ),
            with: {
                owner: true
            }
        });

        // Better strategy: Find owner first
        const repoOwner = await db.query.users.findFirst({
            where: eq(schema.users.username, owner)
        });

        if (!repoOwner) {
            return new Response(JSON.stringify({ error: "Repository owner not found" }), { status: 404 });
        }

        const targetRepo = await db.query.repositories.findFirst({
            where: and(
                eq(schema.repositories.ownerId, repoOwner.id),
                eq(schema.repositories.name, repo) // or slug
            ),
            with: { owner: true }
        });

        if (!targetRepo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), { status: 404 });
        }

        const { action } = await request.json(); // 'star' or 'unstar'

        if (action === "star") {
            // Check if already starred
            const existing = await db.query.repositoryStars.findFirst({
                where: and(
                    eq(schema.repositoryStars.userId, user.id),
                    eq(schema.repositoryStars.repositoryId, targetRepo.id)
                ),
            });

            if (!existing) {
                await db.insert(schema.repositoryStars).values({
                    id: generateId("star"),
                    userId: user.id,
                    repositoryId: targetRepo.id,
                    createdAt: new Date(),
                });

                // Update count
                await db.update(schema.repositories)
                    .set({ starCount: sql`${schema.repositories.starCount} + 1` })
                    .where(eq(schema.repositories.id, targetRepo.id));

                // Log activity
                await logActivity(
                    user.id,
                    "star",
                    "starred",
                    "repository",
                    targetRepo.id,
                    targetRepo.id,
                    { repoName: targetRepo.name, owner: targetRepo.owner.username }
                );
            }
        } else if (action === "unstar") {
            const deleted = await db.delete(schema.repositoryStars)
                .where(and(
                    eq(schema.repositoryStars.userId, user.id),
                    eq(schema.repositoryStars.repositoryId, targetRepo.id)
                ))
                .returning();

            if (deleted.length > 0) {
                // Update count
                await db.update(schema.repositories)
                    .set({ starCount: sql`${schema.repositories.starCount} - 1` })
                    .where(eq(schema.repositories.id, targetRepo.id));
            }
        } else {
            return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error("Failed to star/unstar repo:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
};
