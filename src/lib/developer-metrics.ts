/**
 * Developer Metrics Library
 * Track PR velocity, review efficiency, and team productivity
 */

import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { generateId } from "./utils";

// Types
export interface MetricsSummary {
    period: string;
    prsOpened: number;
    prsMerged: number;
    avgTimeToFirstReview: number; // minutes
    avgTimeToMerge: number; // minutes
    avgReviewRounds: number;
    topAuthors: Array<{ userId: string; username: string; prCount: number }>;
    topReviewers: Array<{ userId: string; username: string; reviewCount: number }>;
}

/**
 * Record metrics for a merged PR
 */
export async function recordPrMetrics(
    pullRequestId: string
): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, pullRequestId),
    });

    if (!pr) return;

    // Calculate time metrics
    const createdAt = new Date(pr.createdAt);
    const mergedAt = pr.mergedAt ? new Date(pr.mergedAt) : null;

    // Get first review
    const reviews = await db.query.pullRequestReviews.findMany({
        where: eq(schema.pullRequestReviews.pullRequestId, pullRequestId),
        orderBy: [schema.pullRequestReviews.createdAt],
    });

    const firstReview = reviews[0];
    const firstReviewAt = firstReview ? new Date(firstReview.createdAt) : null;

    // Calculate durations in seconds
    const timeToFirstReview = firstReviewAt
        ? Math.floor((firstReviewAt.getTime() - createdAt.getTime()) / 1000)
        : null;

    const timeToMerge = mergedAt
        ? Math.floor((mergedAt.getTime() - createdAt.getTime()) / 1000)
        : null;

    // Count review rounds (number of "changes_requested" followed by updates)
    const changesRequested = reviews.filter(r => r.state === "changes_requested").length;
    const reviewRounds = changesRequested + 1;

    // Check if stacked
    const stackEntry = await db.query.prStackEntries.findFirst({
        where: eq(schema.prStackEntries.pullRequestId, pullRequestId),
    });

    // Upsert metrics
    const existingMetric = await db.query.prMetrics.findFirst({
        where: eq(schema.prMetrics.pullRequestId, pullRequestId),
    });

    // Calculate time to first approval
    const firstApproval = reviews.find(r => r.state === "approved");
    const timeToApproval = firstApproval
        ? Math.floor((new Date(firstApproval.createdAt).getTime() - createdAt.getTime()) / 1000)
        : null;

    // Count commits on the PR (using git log if needed, but for now use stored count)
    const commitCount = 1; // TODO: Fetch actual commit count from git or add to schema

    const metricsData = {
        pullRequestId,
        repositoryId: pr.repositoryId,
        authorId: pr.authorId,
        timeToFirstReview,
        timeToApproval,
        timeToMerge,
        totalCycleTime: timeToMerge,
        reviewRounds,
        reviewersCount: reviews.length,
        commentsCount: pr.commentCount || 0,
        changesRequestedCount: changesRequested,
        linesAdded: pr.additions || 0,
        linesRemoved: pr.deletions || 0,
        filesChanged: pr.changedFiles || 0,
        commits: commitCount,
        isStacked: !!stackEntry,
        stackPosition: stackEntry?.stackOrder || null,
        prCreatedAt: pr.createdAt,
        firstReviewAt: firstReview?.createdAt || null,
        mergedAt: pr.mergedAt,
        updatedAt: new Date(),
    };

    if (existingMetric) {
        await db.update(schema.prMetrics)
            .set(metricsData)
            .where(eq(schema.prMetrics.id, existingMetric.id));
    } else {
        await db.insert(schema.prMetrics).values({
            id: generateId(),
            ...metricsData,
            createdAt: new Date(),
        });
    }
}

/**
 * Update weekly aggregated metrics for a user
 */
export async function updateUserWeeklyMetrics(
    userId: string,
    repositoryId?: string
): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get current ISO week
    const now = new Date();
    const weekOf = getISOWeek(now);

    // Count PRs authored this week
    const authoredPrs = await db.query.prMetrics.findMany({
        where: and(
            eq(schema.prMetrics.authorId, userId),
            repositoryId ? eq(schema.prMetrics.repositoryId, repositoryId) : undefined,
        ),
    });

    // Filter to current week
    const weekStartDate = getWeekStartDate(now);
    const thisWeekAuthored = authoredPrs.filter(
        pr => pr.prCreatedAt && new Date(pr.prCreatedAt) >= weekStartDate
    );

    // Count reviews given this week
    const reviews = await db.query.pullRequestReviews.findMany({
        where: eq(schema.pullRequestReviews.reviewerId, userId),
    });

    const thisWeekReviews = reviews.filter(
        r => new Date(r.createdAt) >= weekStartDate
    );

    // Calculate averages
    const avgTimeToMerge = thisWeekAuthored.length > 0
        ? Math.floor(thisWeekAuthored.reduce((sum, pr) => sum + (pr.timeToMerge || 0), 0) / thisWeekAuthored.length)
        : null;

    // Upsert weekly metrics
    const existing = await db.query.reviewMetrics.findFirst({
        where: and(
            eq(schema.reviewMetrics.userId, userId),
            eq(schema.reviewMetrics.weekOf, weekOf),
            repositoryId ? eq(schema.reviewMetrics.repositoryId, repositoryId) : undefined,
        ),
    });

    const metricsData = {
        userId,
        repositoryId: repositoryId || null,
        weekOf,
        prsAuthored: thisWeekAuthored.length,
        prsAuthoredMerged: thisWeekAuthored.filter(pr => pr.mergedAt).length,
        avgTimeToMergeAuthored: avgTimeToMerge,
        prsReviewed: thisWeekReviews.length,
        approvalsGiven: thisWeekReviews.filter(r => r.state === "approved").length,
        changesRequestedGiven: thisWeekReviews.filter(r => r.state === "changes_requested").length,
        updatedAt: new Date(),
    };

    if (existing) {
        await db.update(schema.reviewMetrics)
            .set(metricsData)
            .where(eq(schema.reviewMetrics.id, existing.id));
    } else {
        await db.insert(schema.reviewMetrics).values({
            id: generateId(),
            ...metricsData,
            createdAt: new Date(),
        });
    }
}

/**
 * Get repository metrics summary
 */
export async function getRepositoryMetrics(
    repositoryId: string,
    weeks: number = 4
): Promise<MetricsSummary[]> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const summaries: MetricsSummary[] = [];

    for (let i = 0; i < weeks; i++) {
        const weekDate = new Date();
        weekDate.setDate(weekDate.getDate() - i * 7);
        const weekOf = getISOWeek(weekDate);

        // Get repo metrics for this week
        const repoMetric = await db.query.repoMetrics.findFirst({
            where: and(
                eq(schema.repoMetrics.repositoryId, repositoryId),
                eq(schema.repoMetrics.weekOf, weekOf),
            ),
        });

        // Get top authors for this week
        const prMetrics = await db.query.prMetrics.findMany({
            where: and(
                eq(schema.prMetrics.repositoryId, repositoryId),
            ),
            with: {
                author: true,
            },
        });

        // Filter and aggregate by author
        const weekStart = getWeekStartDate(weekDate);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const authorCounts = new Map<string, { userId: string; username: string; count: number }>();
        const reviewerCounts = new Map<string, { userId: string; username: string; count: number }>();

        for (const m of prMetrics) {
            if (m.prCreatedAt && new Date(m.prCreatedAt) >= weekStart && new Date(m.prCreatedAt) < weekEnd) {
                const existing = authorCounts.get(m.authorId) || { userId: m.authorId, username: (m as any).author?.username || "unknown", count: 0 };
                existing.count++;
                authorCounts.set(m.authorId, existing);
            }
        }

        // Get reviews for this week
        const weekReviews = await db.query.pullRequestReviews.findMany({
            with: { reviewer: true },
        });

        for (const r of weekReviews) {
            if (new Date(r.createdAt) >= weekStart && new Date(r.createdAt) < weekEnd) {
                const existing = reviewerCounts.get(r.reviewerId) || { userId: r.reviewerId, username: (r as any).reviewer?.username || "unknown", count: 0 };
                existing.count++;
                reviewerCounts.set(r.reviewerId, existing);
            }
        }

        const topAuthors = Array.from(authorCounts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map(a => ({ userId: a.userId, username: a.username, prCount: a.count }));

        const topReviewers = Array.from(reviewerCounts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map(r => ({ userId: r.userId, username: r.username, reviewCount: r.count }));

        summaries.push({
            period: weekOf,
            prsOpened: repoMetric?.prsOpened || 0,
            prsMerged: repoMetric?.prsMerged || 0,
            avgTimeToFirstReview: Math.floor((repoMetric?.avgTimeToFirstReview || 0) / 60),
            avgTimeToMerge: Math.floor((repoMetric?.avgTimeToMerge || 0) / 60),
            avgReviewRounds: repoMetric?.avgReviewRounds || 1,
            topAuthors,
            topReviewers,
        });
    }

    return summaries;
}

/**
 * Get user performance metrics
 */
export async function getUserMetrics(
    userId: string,
    weeks: number = 4
): Promise<{
    authored: { total: number; merged: number; avgTimeToMerge: number };
    reviewed: { total: number; approvals: number; changesRequested: number };
    trends: Array<{ week: string; authored: number; reviewed: number }>;
}> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const metrics = await db.query.reviewMetrics.findMany({
        where: eq(schema.reviewMetrics.userId, userId),
        orderBy: [desc(schema.reviewMetrics.weekOf)],
        limit: weeks,
    });

    const totalAuthored = metrics.reduce((sum, m) => sum + (m.prsAuthored || 0), 0);
    const totalMerged = metrics.reduce((sum, m) => sum + (m.prsAuthoredMerged || 0), 0);
    const totalReviewed = metrics.reduce((sum, m) => sum + (m.prsReviewed || 0), 0);
    const totalApprovals = metrics.reduce((sum, m) => sum + (m.approvalsGiven || 0), 0);
    const totalChangesRequested = metrics.reduce((sum, m) => sum + (m.changesRequestedGiven || 0), 0);

    const avgTimeToMerge = metrics.length > 0 && metrics.some(m => m.avgTimeToMergeAuthored)
        ? Math.floor(metrics.reduce((sum, m) => sum + (m.avgTimeToMergeAuthored || 0), 0) / metrics.filter(m => m.avgTimeToMergeAuthored).length / 60)
        : 0;

    return {
        authored: {
            total: totalAuthored,
            merged: totalMerged,
            avgTimeToMerge,
        },
        reviewed: {
            total: totalReviewed,
            approvals: totalApprovals,
            changesRequested: totalChangesRequested,
        },
        trends: metrics.map(m => ({
            week: m.weekOf,
            authored: m.prsAuthored || 0,
            reviewed: m.prsReviewed || 0,
        })),
    };
}

// Helper functions
function getISOWeek(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${weekNo.toString().padStart(2, "0")}`;
}

function getWeekStartDate(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}
