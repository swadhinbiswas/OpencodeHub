
import type { APIRoute } from "astro";
import { handleReceivePack } from "@/lib/git-server";
import { acquireRepo, releaseRepo, getStorageRepoPath } from "@/lib/git-storage";
import { logger } from "@/lib/logger";

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

    logger.info({ owner, repoName }, "Git receive-pack request");

    let repoPath: string;
    try {
        // Repos are always initialized on creation now, just acquire
        repoPath = await acquireRepo(owner, repoName);
    } catch (err) {
        logger.error({ err }, "Failed to acquire repo");
        return new Response("Repository not found", { status: 404 });
    }

    const storagePath = getStorageRepoPath(owner, repoName);

    // Extract user from Basic Auth if present
    const authHeader = request.headers.get("Authorization");
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

        // Release repo with modification flag true
        // Note: This might trigger re-upload of the packfile effectively checking consistency
        await releaseRepo(owner, repoName, true);

        return new Response(responseStream as any, {
            headers: {
                "Content-Type": "application/x-git-receive-pack-result",
                "Cache-Control": "no-cache",
            },
        });
    } catch (err) {
        logger.error({ err }, "Failed to handle receive-pack");
        // Release repo without saving changes (rollback attempt)
        await releaseRepo(owner, repoName, false);
        return new Response("Internal Server Error", { status: 500 });
    }
};
