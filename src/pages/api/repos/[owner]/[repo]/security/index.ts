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

    // Get latest scans
    const scans = await db.query.securityScans.findMany({
        where: eq(schema.securityScans.repositoryId, repo.id),
        orderBy: [desc(schema.securityScans.startedAt)],
        limit: 10,
        with: {
            vulnerabilities: true // For MVP, return all vuln of recent scans. Ideally separate endpoint.
            // Actually, listing vulnerabilities for the *latest* scan is usually what's needed.
        }
    });

    return success(scans);
});
