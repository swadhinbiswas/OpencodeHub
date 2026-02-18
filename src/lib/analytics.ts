
import { getDatabase } from "../db";
import { type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { eq, and, gte, desc, inArray } from "drizzle-orm";
import { pullRequests, pullRequestReviews } from "../db/schema/pull-requests";

const db = getDatabase() as NodePgDatabase<typeof schema>;

export type DailyStats = {
    date: string;
    cycleTime: number; // Average hours from create to merge
    mergeCount: number; // Number of PRs merged
    reviewTime: number; // Average hours from create to first review
};

export async function getRepoStats(repoId: string, days = 30): Promise<DailyStats[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch merged PRs in the last N days
    const prs = await db
        .select({
            id: pullRequests.id,
            createdAt: pullRequests.createdAt,
            mergedAt: pullRequests.mergedAt,
            reviewCount: pullRequests.reviewCount,
        })
        .from(pullRequests)
        .where(
            and(
                eq(pullRequests.repositoryId, repoId),
                eq(pullRequests.state, "merged"),
                gte(pullRequests.mergedAt, startDate)
            )
        )
        .orderBy(desc(pullRequests.mergedAt));

    const prIds = prs.map((pr) => pr.id);
    const reviews = prIds.length
        ? await db
            .select({
                prId: pullRequestReviews.pullRequestId,
                submittedAt: pullRequestReviews.submittedAt,
                createdAt: pullRequestReviews.createdAt,
            })
            .from(pullRequestReviews)
            .where(inArray(pullRequestReviews.pullRequestId, prIds))
        : [];

    // Group by day
    const statsMap = new Map<string, { totalCycle: number; totalMerge: number; totalReview: number; reviewCounts: number }>();

    // Initialize map with empty days
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        statsMap.set(dateStr, { totalCycle: 0, totalMerge: 0, totalReview: 0, reviewCounts: 0 });
    }

    const firstReviewByPr = new Map<string, Date>();

    for (const review of reviews) {
        const reviewTime = review.submittedAt || review.createdAt;
        if (!reviewTime) continue;
        const current = firstReviewByPr.get(review.prId);
        if (!current || reviewTime < current) {
            firstReviewByPr.set(review.prId, reviewTime);
        }
    }

    // Calculate Metrics
    prs.forEach((pr) => {
        if (!pr.mergedAt || !pr.createdAt) return;
        const dateStr = pr.mergedAt.toISOString().split("T")[0];
        const hours = (pr.mergedAt.getTime() - pr.createdAt.getTime()) / (1000 * 60 * 60);

        const dayStats = statsMap.get(dateStr);
        if (dayStats) {
            dayStats.totalCycle += hours;
            dayStats.totalMerge += 1;

            const firstReviewAt = firstReviewByPr.get(pr.id);
            if (firstReviewAt && firstReviewAt >= pr.createdAt) {
                const reviewHours = (firstReviewAt.getTime() - pr.createdAt.getTime()) / (1000 * 60 * 60);
                dayStats.totalReview += reviewHours;
                dayStats.reviewCounts += 1;
            }
        }
    });

    return Array.from(statsMap.entries())
        .map(([date, data]) => ({
            date,
            cycleTime: data.totalMerge ? Math.round((data.totalCycle / data.totalMerge) * 100) / 100 : 0,
            mergeCount: data.totalMerge,
            reviewTime: data.reviewCounts ? Math.round((data.totalReview / data.reviewCounts) * 100) / 100 : 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
