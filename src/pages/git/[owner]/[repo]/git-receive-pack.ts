
import type { APIRoute } from "astro";
import { handleReceivePack } from "@/lib/git-server";
import { acquireRepo, releaseRepo, getStorageRepoPath } from "@/lib/git-storage";
import { logger } from "@/lib/logger";
import { getDatabase, schema } from "@/db";
import { validateBasicAuth } from "@/lib/auth-basic";
import { canWriteRepo } from "@/lib/permissions";
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
    if (contentType !== "application/x-git-receive-pack-request") {
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

    // Check write permission
    const user = userId ? await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
    }) : null;
    const isAdmin = user?.isAdmin === true;
    const hasAccess = await canWriteRepo(userId || undefined, repoData, { isAdmin });

    if (!hasAccess) {
        return new Response("Unauthorized", {
            status: 401,
            headers: { "WWW-Authenticate": 'Basic realm="OpenCodeHub"' },
        });
    }

    logger.info({ owner, repoName }, "Git receive-pack request");

    let repoPath: string;
    try {
        repoPath = await acquireRepo(owner, repoName);
    } catch (err) {
        logger.error({ err }, "Failed to acquire repo");
        return new Response("Repository not found", { status: 404 });
    }

    const storagePath = getStorageRepoPath(owner, repoName);

    // Extract user from Basic Auth if present
    let remoteUser = "git";
    if (authHeader && authHeader.startsWith("Basic ")) {
        try {
            const buffer = Buffer.from(authHeader.slice(6), "base64");
            const creds = buffer.toString("utf-8");
            const [user] = creds.split(":");
            if (user) remoteUser = user;
        } catch (e) {
            // Ignore auth parse errors
        }
    }

    try {
        // Process the pack stream
        const responseStream = await handleReceivePack(repoPath, request.body!, storagePath, {
            REMOTE_USER: remoteUser
        });

        // Return response first, then sync to cloud storage in background
        // This prevents the S3 upload from blocking the git client response
        const response = new Response(responseStream as any, {
            headers: {
                "Content-Type": "application/x-git-receive-pack-result",
                "Cache-Control": "no-cache",
            },
        });

        // Sync to cloud storage in background (non-blocking)
        releaseRepo(owner, repoName, true).catch(err => {
            logger.error({ err }, "Failed to sync repo to storage after push");
        });

        return response;
    } catch (err) {
        logger.error({ err }, "Failed to handle receive-pack");
        // Release repo without saving changes (rollback attempt)
        await releaseRepo(owner, repoName, false);
        return new Response("Internal Server Error", { status: 500 });
    }
};
