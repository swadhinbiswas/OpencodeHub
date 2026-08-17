
import { getDatabase, schema } from "@/db";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import type { APIRoute } from "astro";
import os from "node:os";
import { withErrorHandler } from "@/lib/errors";
import { success } from "@/lib/api";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const GET: APIRoute = withErrorHandler(async ({ locals }) => {
    const user = locals.user;
    if (!user?.isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
        });
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // 1. Total Counts
    const repoCountResult = await db.select({ count: count() }).from(schema.repositories).limit(1);
    const repoCount = Number(repoCountResult[0]?.count) || 0;

    const userCountResult = await db.select({ count: count() }).from(schema.users).limit(1);
    const userCount = Number(userCountResult[0]?.count) || 0;

    const prCountResult = await db.select({ count: count() }).from(schema.pullRequests).limit(1);
    const prCount = Number(prCountResult[0]?.count) || 0;

    // 2. Trending Developers - Get users with most recent activity
    const topUsers = await db.query.users.findMany({
        limit: 5,
        orderBy: [desc(schema.users.createdAt)],
    });

    // 3. Activity Log
    const activities = await db.query.activities.findMany({
        limit: 20,
        orderBy: [desc(schema.activities.createdAt)],
        with: {
            user: true,
            repository: true,
        }
    });

    // 4. Code Stats — aggregate in SQL to avoid loading all rows into memory
    let added = 0;
    let deleted = 0;
    try {
      const statsRows = await db.execute(sql`
        SELECT
          COALESCE(SUM((stats::json->>'additions')::int), 0)::int AS total_added,
          COALESCE(SUM((stats::json->>'deletions')::int), 0)::int AS total_deleted
        FROM commits
      `);
      const row = (statsRows as any)?.rows?.[0] || (Array.isArray(statsRows) ? statsRows[0] : null);
      if (row) {
        added = Number(row.total_added) || 0;
        deleted = Number(row.total_deleted) || 0;
      }
    } catch (e) {
      // Fallback: if JSON extraction fails, return zeros (non-critical)
      logger.warn({ e }, "Failed to aggregate commit stats via SQL");
    }

    // 5. Languages Stats — aggregate in SQL to avoid loading all repos into memory
    const langMap: Record<string, number> = {};
    let totalLangUsage = 0;
    try {
      const langRows = await db.execute(sql`
        SELECT
          key AS lang,
          SUM(val::bigint)::bigint AS total_bytes
        FROM repositories,
             jsonb_each_text(COALESCE(languages::jsonb, '{}'::jsonb)) AS kv(key, val)
        GROUP BY key
        ORDER BY total_bytes DESC
        LIMIT 20
      `);
      const rows = (langRows as any)?.rows || (Array.isArray(langRows) ? langRows : []);
      for (const r of rows) {
        const langName = String(r.lang);
        const bytes = Number(r.total_bytes) || 0;
        langMap[langName] = bytes;
        totalLangUsage += bytes;
      }
    } catch (e) {
      // Fallback: if JSON extraction fails, return empty (non-critical)
      logger.warn({ e }, "Failed to aggregate language stats via SQL");
    }

    const languages = Object.entries(langMap)
        .map(([name, count]) => ({
            name,
            percentage: totalLangUsage > 0 ? Math.round((count / totalLangUsage) * 100) : 0
        }))
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 5)
        .map((l, i) => ({
            ...l,
            color: ["#3178c6", "#dea584", "#3572A5", "#00ADD8", "#e34c26", "#563d7c"][i % 6] || "#ccc"
        }));


    // 6. System Status (Real)
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const cpuLoad = Math.min(Math.round((loadAvg[0] / cpus.length) * 100), 100);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = Math.round((usedMem / totalMem) * 100);

    let storageUsage = 45;
    try {
        const { statfs } = await import('node:fs/promises');
        const fsStats = await statfs(process.env.STORAGE_PATH || './');
        const totalStorage = fsStats.blocks * fsStats.bsize;
        const freeStorage = fsStats.bfree * fsStats.bsize;
        if (totalStorage > 0) {
            storageUsage = Math.round(((totalStorage - freeStorage) / totalStorage) * 100);
        }
    } catch (e) {
        console.error("Failed to read disk stats:", e);
    }

    const uptimeSeconds = os.uptime();
    const days = Math.floor(uptimeSeconds / (3600 * 24));
    const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    // 7. Quick Stats - Real data
    // Commits today - count commits from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000); // Date object, not string

    const commitsTodayResult = await db.select({ count: count() })
        .from(schema.commits)
        .where(gte(schema.commits.authorDate, oneDayAgo))
        .limit(1);
    const commitsToday = Number(commitsTodayResult[0]?.count) || 0;

    const prsMergedResult = await db.select({ count: count() })
        .from(schema.pullRequests)
        .where(eq(schema.pullRequests.state, 'merged'))
        .limit(1);
    const prsMerged = Number(prsMergedResult[0]?.count) || 0;

    const issuesClosedResult = await db.select({ count: count() })
        .from(schema.issues)
        .where(eq(schema.issues.state, 'closed'))
        .limit(1);
    const issuesClosed = Number(issuesClosedResult[0]?.count) || 0;

    // Active users - users who have activity in last 24 hours
    const activeUsers = await db.selectDistinct({ userId: schema.activities.userId })
        .from(schema.activities)
        .where(gte(schema.activities.createdAt, oneDayAgo)); // limit() not needed/appropriate for distinct list length check?
    // Wait, original used .all() (sqlite). Postgres `.select(...)` returns array.
    const activeUsersCount = activeUsers.length;

    // Runners count
    const activeRunnersResult = await db.select({ count: count() })
        .from(schema.pipelineRunners)
        .where(eq(schema.pipelineRunners.status, 'online'))
        .limit(1);
    const activeRunners = Number(activeRunnersResult[0]?.count) || 0;

    // 8. Recent Activity - for the timeline widget
    const recentActivity = activities.slice(0, 4).map(a => {
        // @ts-ignore
        const repoName = a.repository?.name || 'unknown';
        // @ts-ignore
        const userName = a.user?.username || 'unknown';

        const typeMap: Record<string, string> = {
            'PUSH': 'commit',
            'PULL_REQUEST_OPEN': 'pr',
            'PULL_REQUEST_CLOSE': 'pr',
            'FORK': 'fork',
            'STAR': 'star',
            'COMMENT': 'comment',
        };

        const actionMap: Record<string, string> = {
            'PUSH': 'pushed to',
            'PULL_REQUEST_OPEN': 'opened PR in',
            'PULL_REQUEST_CLOSE': 'closed PR in',
            'FORK': 'forked',
            'STAR': 'starred',
            'COMMENT': 'commented on',
        };

        return {
            id: a.id,
            type: typeMap[a.type] || 'commit',
            user: userName,
            action: actionMap[a.type] || a.action,
            target: repoName,
            time: getTimeAgo(a.createdAt)
        };
    });

    const stats = {
        totalRepos: repoCount,
        totalUsers: userCount,
        collaborations: prCount,
        trendingDevelopers: topUsers.map((u, i) => ({
            rank: i + 1,
            name: u.username,
            lang: languages[i % languages.length]?.name || "TypeScript",
            color: ["#61dafb", "#e8a87c", "#85dcb", "#41b883", "#ffcb2b", "#ff3366"][i % 6]
        })),
        activityLog: activities.map(a => {
            // @ts-ignore
            const repoName = a.repository?.name;
            // @ts-ignore
            const userName = a.user?.username;

            return {
                id: a.id,
                timestamp: new Date(a.createdAt).toLocaleTimeString(),
                type: a.type,
                message: `${a.action} ${a.targetType}`,
                repo: repoName || "unknown",
                user: userName || "unknown"
            };
        }),
        codeStats: {
            added,
            deleted
        },
        reviewStats: {
            count: prCount,
            activeReviewers: topUsers.map(u => ({ avatar: u.avatarUrl || "" }))
        },
        languages,
        systemStatus: {
            cpuLoad: cpuLoad || 1,
            memoryUsage: memUsage,
            memoryTotal: Math.round(totalMem / (1024 * 1024 * 1024)),
            storageUsage,
            activeRunners,
            uptime: `${days}d ${hours}h ${minutes}m`
        },
        // New data for widgets
        quickStats: {
            commitsToday: commitsToday,
            prsMerged: prsMerged,
            issuesClosed: issuesClosed,
            activeUsers: activeUsersCount
        },
        recentActivity
    };



    return success(stats);
});

// Helper function to get relative time
function getTimeAgo(dateStr: string | Date): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
}
