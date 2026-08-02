
import type { APIRoute } from "astro";
import { handleUploadPack } from "@/lib/git-server";
import { acquireRepo, releaseRepo } from "@/lib/git-storage";
import { logger } from "@/lib/logger";
import { getDatabase, schema } from "@/db";
import { validateBasicAuth } from "@/lib/auth-basic";
import { canReadRepo } from "@/lib/permissions";
import { and, eq } from "drizzle-orm";

export const POST: APIRoute = async ({ params, request }) => {
    const { owner, repo } = params;

    if (!owner || !repo) {
        return new Response("Missing owner or repo", { status: 400 });
    }

    // Handle .git suffix
    const repoName = repo.endsWith(".git") ? repo.slice(0, -4) : repo;

    // Check Content-Type
    const contentType = request.headers.get("Content-Type");
    if (contentType !== "application/x-git-upload-pack-request") {
        return new Response("Invalid Content-Type", { status: 415 });
    }

    // Authenticate user
    const authHeader = request.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
        userId = await validateBasicAuth(authHeader);
    }

    // Find repo and check permissions
    const db = getDatabase();
    const ownerUser = await db.query.users.findFirst({
        where: eq(schema.users.username, owner),
    });

    if (!ownerUser) {
        return new Response("Repository not found", { status: 404 });
    }

    const repoData = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, ownerUser.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repoData) {
        return new Response("Repository not found", { status: 404 });
    }

    // Check read permission
    const hasAccess = await canReadRepo(userId || undefined, repoData);
    if (!hasAccess) {
        return new Response("Unauthorized", {
            status: 401,
            headers: { "WWW-Authenticate": 'Basic realm="OpenCodeHub"' },
        });
    }

    logger.info({ owner, repoName }, "Git upload-pack request");

    let repoPath: string;
    try {
        repoPath = await acquireRepo(owner, repoName);
    } catch (err) {
        logger.error({ err }, "Failed to acquire repo");
        return new Response("Repository not found", { status: 404 });
    }

    // Check if repository is initialized (has HEAD file)
    const { existsSync } = await import("fs");
    const { join } = await import("path");
    const headPath = join(repoPath, 'HEAD');

    if (!existsSync(headPath)) {
        logger.warn({ repoPath }, "Attempted to clone uninitialized repository");
        return new Response(
            "Repository is empty. Push some code first before cloning.",
            { status: 404 }
        );
    }

    try {
        // Process the upload request
        const responseStream = await handleUploadPack(repoPath, request.body!);

        return new Response(responseStream as any, {
            headers: {
                "Content-Type": "application/x-git-upload-pack-result",
                "Cache-Control": "no-cache",
            },
        });
    } catch (err) {
        logger.error({ err }, "Failed to handle upload-pack");
        return new Response("Internal Server Error", { status: 500 });
    } finally {
        // Release repo (read-only)
        await releaseRepo(owner, repoName, false);
    }
};
