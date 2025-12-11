import { getDatabase, schema } from "@/db";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";

export const GET: APIRoute = async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }

    const db = getDatabase();
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName!),
    });

    if (!repoOwner) return new Response("Not Found", { status: 404 });

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName!)
        ),
    });

    if (!repo) return new Response("Not Found", { status: 404 });

    if (!(await canReadRepo(user.id, repo))) {
        return new Response("Forbidden", { status: 403 });
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

    return new Response(JSON.stringify(scans), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};
