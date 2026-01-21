
import type { APIRoute } from "astro";
import { getAdvertisedRefs } from "@/lib/git-server";
import { acquireRepo, releaseRepo } from "@/lib/git-storage";
import { logger } from "@/lib/logger";

export const GET: APIRoute = async ({ params, request, url }) => {
    const { owner, repo } = params;

    if (!owner || !repo) {
        return new Response("Missing owner or repo", { status: 400 });
    }

    // Handle .git suffix
    const repoName = repo.endsWith(".git") ? repo.slice(0, -4) : repo;

    const service = url.searchParams.get("service");

    // Git protocol requires service param (e.g., git-upload-pack or git-receive-pack)
    if (!service || !["git-upload-pack", "git-receive-pack"].includes(service)) {
        // Dumb protocol buffer? Or just error. Modern clients use smart protocol
        return new Response("Service not specified or invalid", { status: 400 });
    }

    logger.info({ owner, repoName, service }, "=== GIT INFO/REFS REQUEST START ===");

    // Acquire repo (download/cache)
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

    logger.info({ headPath, exists: existsSync(headPath) }, "Checking if repo is initialized");

    if (!existsSync(headPath)) {
        // Repository not initialized yet (lazy init)
        logger.warn({ repoName, service, headPath }, "Repository not initialized - returning error");

        if (service === "git-upload-pack") {
            // Return error for clone attempts on empty repo
            logger.error({ repoName }, "Blocking clone attempt on empty repository");
            return new Response("Repository is empty. Push some code first before cloning.", { status: 404 });
        }

        // For receive-pack (push), return minimal capabilities to allow first push
        logger.info("Returning empty refs for receive-pack");
        const emptyRefs = `001e# service=${service}\n0000` +
            `00000000000000000000000000000000000000000000 capabilities^{}\0report-status report-status-v2 side-band-64k object-format=sha1\n` +
            `0000`;

        return new Response(emptyRefs, {
            headers: {
                "Content-Type": `application/x-${service}-advertisement`,
                "Cache-Control": "no-cache",
            },
        });
    }

    logger.info("Repository is initialized, proceeding with normal refs");

    try {
        const refs = await getAdvertisedRefs({
            repoPath,
            service: service as "git-upload-pack" | "git-receive-pack",
        });

        return new Response(refs, {
            headers: {
                "Content-Type": `application/x-${service}-advertisement`,
                "Cache-Control": "no-cache",
            },
        });
    } catch (err) {
        logger.error({ err }, "Failed to get refs");
        return new Response("Internal Server Error", { status: 500 });
    } finally {
        // Release repo (no modification)
        await releaseRepo(owner, repoName, false);
    }
};
