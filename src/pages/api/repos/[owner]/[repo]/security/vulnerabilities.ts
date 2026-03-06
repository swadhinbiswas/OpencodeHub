import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, desc, eq, sql } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { unauthorized, notFound, forbidden, success, badRequest } from "@/lib/api";

function parsePositiveInt(value: string | null, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return parsed;
}

export const GET: APIRoute = withErrorHandler(async ({ params, locals, url }) => {
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

    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const pageSize = Math.min(parsePositiveInt(url.searchParams.get("pageSize"), 25), 100);
    const severity = url.searchParams.get("severity")?.toUpperCase() || "";
    const scanIdFromQuery = url.searchParams.get("scanId");

    const latestScan = await db.query.securityScans.findFirst({
        where: eq(schema.securityScans.repositoryId, repo.id),
        orderBy: [desc(schema.securityScans.startedAt)],
        columns: { id: true },
    });

    const scanId = scanIdFromQuery || latestScan?.id;
    if (!scanId) {
        return success({
            scanId: null,
            page,
            pageSize,
            total: 0,
            totalPages: 0,
            items: [],
        });
    }

    const scan = await db.query.securityScans.findFirst({
        where: and(
            eq(schema.securityScans.id, scanId),
            eq(schema.securityScans.repositoryId, repo.id)
        ),
        columns: { id: true },
    });
    if (!scan) {
        return badRequest("Invalid scanId");
    }

    const filters = [eq(schema.securityVulnerabilities.scanId, scanId)];
    if (severity) {
        filters.push(eq(schema.securityVulnerabilities.severity, severity));
    }

    const [countRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(schema.securityVulnerabilities)
        .where(and(...filters));

    const total = countRow?.count || 0;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    const items = await db.query.securityVulnerabilities.findMany({
        where: and(...filters),
        orderBy: [desc(schema.securityVulnerabilities.severity), desc(schema.securityVulnerabilities.vulnerabilityId)],
        limit: pageSize,
        offset,
    });

    return success({
        scanId,
        page,
        pageSize,
        total,
        totalPages,
        items,
    });
});

