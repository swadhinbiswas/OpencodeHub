
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { withErrorHandler } from "@/lib/errors";
import { success, unauthorized } from "@/lib/api";

import { getUserFromRequest } from "@/lib/auth";

export const GET: APIRoute = withErrorHandler(async ({ request, locals }) => {
    // Try locals first (session auth), then fallback to header token (CLI auth)
    let userId = locals.user?.id;

    if (!userId) {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }
        userId = tokenPayload.userId;
    }

    const url = new URL(request.url);
    const weeks = parseInt(url.searchParams.get("weeks") || "4");

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - (weeks * 7));

    const db = getDatabase();

    // 1. Authored PRs Stats
    const authoredPrs = await db.query.pullRequests.findMany({
        where: and(
            eq(schema.pullRequests.authorId, userId),
            gte(schema.pullRequests.createdAt, startDate)
        )
    });

    const mergedPrs = authoredPrs.filter(pr => pr.isMerged);

    // Calculate avg time to merge
    let totalMergeTime = 0;
    mergedPrs.forEach(pr => {
        if (pr.mergedAt && pr.createdAt) {
            totalMergeTime += (pr.mergedAt.getTime() - pr.createdAt.getTime());
        }
    });

    // Convert to hours
    const avgTimeToMerge = mergedPrs.length > 0
        ? (totalMergeTime / mergedPrs.length) / (1000 * 60 * 60)
        : 0;

    // 2. Review Stats
    const reviews = await db.query.pullRequestReviews.findMany({
        where: and(
            eq(schema.pullRequestReviews.reviewerId, userId),
            gte(schema.pullRequestReviews.createdAt, startDate)
        )
    });

    const approvals = reviews.filter(r => r.state === "approved").length;
    const changesRequested = reviews.filter(r => r.state === "changes_requested").length;

    // 3. Calculate Trends (Weekly)
    const trends = [];
    for (let i = 0; i < weeks; i++) {
        const weekStart = new Date();
        weekStart.setDate(now.getDate() - ((i + 1) * 7));
        const weekEnd = new Date();
        weekEnd.setDate(now.getDate() - (i * 7));

        const weekLabel = `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;

        const weekAuthored = authoredPrs.filter(
            pr => pr.createdAt >= weekStart && pr.createdAt < weekEnd
        ).length;

        const weekReviewed = reviews.filter(
            r => r.createdAt >= weekStart && r.createdAt < weekEnd
        ).length;

        trends.unshift({
            week: weekLabel,
            authored: weekAuthored,
            reviewed: weekReviewed
        });
    }

    return success({
        authored: {
            total: authoredPrs.length,
            merged: mergedPrs.length,
            avgTimeToMerge // in hours
        },
        reviewed: {
            total: reviews.length,
            approvals,
            changesRequested
        },
        trends
    });
});
