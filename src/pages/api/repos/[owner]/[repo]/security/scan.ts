import { getDatabase, schema } from "@/db";
import { canWriteRepo } from "@/lib/permissions";
import { runSecurityScan } from "@/lib/security";
import { generateId } from "@/lib/utils";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const POST: APIRoute = async ({ params, locals }) => {
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

    if (!(await canWriteRepo(user.id, repo))) {
        return new Response("Forbidden", { status: 403 });
    }

    // Create scan record
    const scanId = generateId();
    await db.insert(schema.securityScans).values({
        id: scanId,
        repositoryId: repo.id,
        status: "queued",
        startedAt: new Date(),
    });

    // Start scan asynchronously
    runSecurityScan(repo.diskPath, scanId, repo.id).catch(err => {
        console.error("Background scan failed to start properly", err);
    });

    return new Response(JSON.stringify({ scanId, status: "queued" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
    });
};
