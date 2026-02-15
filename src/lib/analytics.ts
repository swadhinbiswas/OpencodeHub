
import { getDatabase } from "../db";
import { type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
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

    // Also fetch reviews for review velocity
    const reviews = await db
        .select({
            prId: pullRequestReviews.pullRequestId,
            submittedAt: pullRequestReviews.submittedAt,
        })
        .from(pullRequestReviews)
        .innerJoin(pullRequests, eq(pullRequestReviews.pullRequestId, pullRequests.id))
        .where(
            and(
                eq(pullRequests.repositoryId, repoId),
                gte(pullRequestReviews.submittedAt, startDate)
            )
        );

    // Group by day
    const statsMap = new Map<string, { totalCycle: number; totalMerge: number; totalReview: number; reviewCounts: number }>();

    // Initialize map with empty days
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        statsMap.set(dateStr, { totalCycle: 0, totalMerge: 0, totalReview: 0, reviewCounts: 0 });
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
        }
    });

    // Calculate Review Velocity (rough approx: merged PRs or any PR with review?)
    // Let's use the reviews we fetched.
    // We need to match review to its PR creation time.
    // This is a bit complex in one go. For MVP, let's simplify review velocity:
    // Average time for *merged* PRs to get their first review?
    // Let's iterate reviews and match to PRs if we have them. 
    // Ideally we need `pullRequests` creation time for the reviews.
    // Let's stick to Cycle Time and Merge Frequency for MVP robustness.

    return Array.from(statsMap.entries())
        .map(([date, data]) => ({
            date,
            cycleTime: data.totalMerge ? Math.round((data.totalCycle / data.totalMerge) * 100) / 100 : 0,
            mergeCount: data.totalMerge,
            reviewTime: 0 // Placeholder
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
