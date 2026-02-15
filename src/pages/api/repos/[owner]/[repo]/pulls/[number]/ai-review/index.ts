
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { canReadRepo } from "@/lib/permissions";

export const GET: APIRoute = async ({ params, locals }) => {
    const { owner, repo: repoName, number } = params;
    const user = locals.user;

    const db = getDatabase();

    // 1. Fetch Repo & PR
    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repoName!),
            eq(schema.repositories.ownerId, (
                await db.query.users.findFirst({
                    where: eq(schema.users.username, owner!),
                    columns: { id: true }
                })
            )?.id || "")
        ),
        with: { owner: true }
    });

    if (!repository) return new Response("Repo not found", { status: 404 });

    // Permissions check
    if (!(await canReadRepo(user?.id, repository))) {
        return new Response("Forbidden", { status: 403 });
    }

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, parseInt(number!))
        )
    });

    if (!pr) return new Response("PR not found", { status: 404 });

    // 2. Fetch Latest Review
    const review = await db.query.aiReviews.findFirst({
        where: eq(schema.aiReviews.pullRequestId, pr.id),
        orderBy: [desc(schema.aiReviews.createdAt)],
    });

    if (!review) {
        return new Response(JSON.stringify(null), {
            headers: { "Content-Type": "application/json" }
        });
    }

    // 3. Fetch Suggestions
    const suggestions = await db.query.aiReviewSuggestions.findMany({
        where: eq(schema.aiReviewSuggestions.aiReviewId, review.id),
    });

    return new Response(JSON.stringify({ review, suggestions }), {
        headers: { "Content-Type": "application/json" }
    });
};
