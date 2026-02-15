
import { getDatabase } from "../db";
import { type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { eq, and, count } from "drizzle-orm";
import { pullRequestReviewers, pullRequests } from "../db/schema/pull-requests";
import { users } from "../db/schema/users";

const db = getDatabase() as NodePgDatabase<typeof schema>;

/**
 * Suggests reviewers for a PR based on load balancing.
 * Strategy: Find users with the fewest OPEN review requests.
 */
export async function getSuggestedReviewers(
    repoId: string,
    excludeUserIds: string[] = []
) {
    const allUsers = await db.select().from(users);

    // Count open review requests per user
    const loadCounts = await db
        .select({
            userId: pullRequestReviewers.userId,
            pendingCount: count(pullRequestReviewers.id),
        })
        .from(pullRequestReviewers)
        .innerJoin(pullRequests, eq(pullRequestReviewers.pullRequestId, pullRequests.id))
        .where(eq(pullRequests.state, "open"))
        .groupBy(pullRequestReviewers.userId);

    const loadMap = new Map<string, number>();
    loadCounts.forEach((c) => loadMap.set(c.userId, Number(c.pendingCount)));

    const candidates = allUsers
        .filter((u) => !excludeUserIds.includes(u.id))
        .map((u) => ({
            user: u,
            load: loadMap.get(u.id) || 0,
        }))
        .sort((a, b) => a.load - b.load);

    // Return top 5 suggestions
    return candidates.slice(0, 5);
}
