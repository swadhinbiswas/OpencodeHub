import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { unauthorized, notFound, forbidden, success } from "@/lib/api";

// ... existing imports ...

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName!),
    });

    if (!repoOwner) return notFound("Not Found");

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName!)
        ),
    });

    if (!repo) return notFound("Not Found");

    if (!(await canReadRepo(user.id, repo))) {
        return forbidden();
    }

    // Return recent scan summaries only. Vulnerabilities are exposed via paginated endpoint.
    const scans = await db.query.securityScans.findMany({
        where: eq(schema.securityScans.repositoryId, repo.id),
        orderBy: [desc(schema.securityScans.startedAt)],
        limit: 10,
        columns: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            criticalCount: true,
            highCount: true,
            mediumCount: true,
            lowCount: true,
            unknownCount: true,
            logs: true,
        }
    });

    const latest = scans[0] || null;
    const summary = latest
        ? {
            latestScanId: latest.id,
            status: latest.status,
            total:
                (latest.criticalCount || 0) +
                (latest.highCount || 0) +
                (latest.mediumCount || 0) +
                (latest.lowCount || 0) +
                (latest.unknownCount || 0),
            critical: latest.criticalCount || 0,
            high: latest.highCount || 0,
            medium: latest.mediumCount || 0,
            low: latest.lowCount || 0,
            unknown: latest.unknownCount || 0,
            policy: (() => {
                if (!latest.logs) return { policyViolations: 0, blockingViolations: 0, mode: null };
                try {
                    const parsed = JSON.parse(latest.logs);
                    return {
                        policyViolations: Number(parsed.policyViolations || 0),
                        blockingViolations: Number(parsed.blockingViolations || 0),
                        mode: parsed.policyMode || null,
                    };
                } catch {
                    return { policyViolations: 0, blockingViolations: 0, mode: null };
                }
            })(),
        }
        : null;

    return success({ scans, summary });
});
