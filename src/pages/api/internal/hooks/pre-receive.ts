import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";
import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
// import micromatch from "micromatch"; // We might need this for glob matching, but for now exact match or manual regex

export const POST: APIRoute = async ({ request, url }) => {
    const repoPath = url.searchParams.get("repo");
    if (!repoPath) {
        return new Response("Missing repo path", { status: 400 });
    }

    let body: { oldrev: string; newrev: string; refname: string };
    try {
        body = await request.json();
    } catch (e) {
        return new Response("Invalid JSON", { status: 400 });
    }

    const { refname, newrev, oldrev } = body;
    // const isForcePush = ... // Hard to detect strictly from here without more Git context, but typically oldrev mismatch?
    // Actually, force push is when newrev is not a descendant of oldrev. We can check that if we have git access.
    // For now, let's focus on branch existence and roles.

    const branchName = refname.replace("refs/heads/", "");
    if (!branchName) {
        return new Response("OK", { status: 200 }); // Not a branch push (e.g. tag), or ignore for now
    }

    const db = getDatabase();

    // Find repo
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.diskPath, repoPath),
        with: {
            owner: true
        }
    });

    if (!repo) {
        return new Response("Repo not found", { status: 404 });
    }

    // Fetch protection rules
    const rules = await db.query.branchProtection.findMany({
        where: and(
            eq(schema.branchProtection.repositoryId, repo.id),
            eq(schema.branchProtection.active, true)
        )
    });

    const matchingRule = rules.find(rule => {
        // Simple exact match or wildcard
        if (rule.pattern === branchName) return true;
        if (rule.pattern.endsWith("*")) {
            return branchName.startsWith(rule.pattern.slice(0, -1));
        }
        return false;
    });

    if (!matchingRule) {
        return new Response("OK", { status: 200 });
    }

    // Enforce rules

    // 1. Require PR
    if (matchingRule.requiresPr) {
        // If newrev allows force push (0000 -> sha is Create, Sha -> 0000 is Delete)
        const isDelete = newrev === "0000000000000000000000000000000000000000";

        if (isDelete) {
            // Prevent deleting protected branch?
            return new Response(`Deleting protected branch '${branchName}' is not allowed.`, { status: 403 });
        }

        // Check if this push is allowed directly? 
        // Typically "Require PR" means you can't push directly to this branch.
        // ALWAYS REJECT direct pushes if Requires PR is on.
        // UNLESS the user is an admin? Or bypass list?
        // For OpenCodeHub V1, let's strict block.

        // EXCEPTION: If this push is actually a MERGE from a PR? 
        // But we are in pre-receive. How do we know?
        // System pushes (merges) usually bypass hooks or have a special user.
        // Since our Merge Queue triggers merges on the server, does it run pre-receive?
        // git operations on local file system often interact with hooks.
        // But typically `git update-ref` does NOT trigger hooks. 
        // Our `mergeBranch` uses `git merge-tree` + `update-ref` (or `commit-tree` + `update-ref`).
        // So server-side merges should be SAFE.
        // This hook is triggered by `git receive-pack` (SSH/HTTP push from user).

        return new Response(`Protected branch '${branchName}' requires a Pull Request. Direct pushes are disabled.`, { status: 403 });
    }

    // 2. Prevent Force Push
    if (!matchingRule.allowForcePushes) {
        // We need to check if it's a force push.
        // git rev-list oldrev ^newrev (if output non-empty, it's non-fast-forward?)
        // Actually simpler: `git merge-base --is-ancestor oldrev newrev`
        // If exit code 0, it is fast-forward. If 1, it's force push (history rewrite/divergence).
        // Note: `oldrev` 0000... is creation (always allowed as fast-forward technically).

        if (oldrev !== "0000000000000000000000000000000000000000" && newrev !== "0000000000000000000000000000000000000000") {
            try {
                // We need to run git command here.
                // This is expensive for an API request? Maybe. But necessary.
                // We can use simple-git.
                const { simpleGit } = await import("simple-git");
                const git = simpleGit(repoPath);
                try {
                    // merge-base --is-ancestor oldrev newrev
                    await git.raw(["merge-base", "--is-ancestor", oldrev, newrev]);
                } catch (err) {
                    // If it fails, it means not ancestor -> Force push!
                    return new Response(`Force pushes to protected branch '${branchName}' are not allowed.`, { status: 403 });
                }
            } catch (e) {
                logger.error({ err: e }, "Failed to check force push status");
                // Fail safe or open? Fail safe -> Block
                return new Response("Failed to verify push safety.", { status: 500 });
            }
        }
    }

    return new Response("OK", { status: 200 });
};
