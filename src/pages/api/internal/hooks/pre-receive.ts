import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "@/lib/logger";
import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import micromatch from "micromatch";

export const POST: APIRoute = async ({ request, url }) => {
    const hookSecret = process.env.INTERNAL_HOOK_SECRET;
    if (!hookSecret) {
        return new Response("Server misconfigured", { status: 500 });
    }
    const providedSecret = request.headers.get("X-Hook-Secret");
    if (providedSecret !== hookSecret) {
        return new Response("Unauthorized", { status: 401 });
    }

    const repoPath = url.searchParams.get("repo");
    if (!repoPath) {
        return new Response("Missing repo path", { status: 400 });
    }

    let body: { oldrev: string; newrev: string; refname: string; pusher?: string };
    try {
        body = await request.json();
    } catch (e) {
        return new Response("Invalid JSON", { status: 400 });
    }

    const { refname, newrev, oldrev, pusher } = body;
    const userId = pusher; // The SSH server sends REMOTE_USER as userId
    // const isForcePush = ... // Hard to detect strictly from here without more Git context, but typically oldrev mismatch?
    // Actually, force push is when newrev is not a descendant of oldrev. We can check that if we have git access.
    // For now, let's focus on branch existence and roles.

    const branchName = refname.replace("refs/heads/", "");
    if (!branchName) {
        return new Response("OK", { status: 200 }); // Not a branch push (e.g. tag), or ignore for now
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Extract owner and repo name from path for flexible lookup
    // Path formats: 
    //   - local: /path/to/data/repos/owner/repo.git
    //   - cloud diskPath: repos/owner/repo.git
    //   - temp path: /path/to/.tmp/repos/owner/repo.git
    const pathParts = repoPath.split('/');
    const repoGit = pathParts.pop() || '';
    const repoName = repoGit.replace('.git', '');
    const owner = pathParts.pop() || '';

    // Try finding by exact diskPath first
    let repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.diskPath, repoPath),
        with: { owner: true }
    });

    // If not found, try cloud storage path format
    if (!repo && owner && repoName) {
        const cloudPath = `repos/${owner}/${repoName}.git`;
        repo = await db.query.repositories.findFirst({
            where: eq(schema.repositories.diskPath, cloudPath),
            with: { owner: true }
        });
    }

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

    // 3. Path-based Write Protection
    const strictPathPermissions = await db.query.repositoryPathPermissions.findMany({
        where: eq(schema.repositoryPathPermissions.repositoryId, repo.id)
    });

    if (strictPathPermissions.length > 0) {
        if (!userId || userId === "anonymous") {
            return new Response("Write access denied: User identity required for protected repository.", { status: 403 });
        }

        let changedFiles: string[] = [];
        try {
            const { simpleGit } = await import("simple-git");
            const git = simpleGit(repoPath);

            // Determine base revision for diff
            let baseRev = oldrev;

            // Handle new branch creation (oldrev is zero)
            if (baseRev === "0000000000000000000000000000000000000000") {
                const defaultBranch = repo.defaultBranch || "main";

                // If creating default branch itself, diff against empty tree
                if (branchName === defaultBranch) {
                    baseRev = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // Empty tree hash
                } else {
                    // Try to find the split point (merge-base) between new branch and default
                    // But newrev is the tip.
                    // Simply diffing against default branch on server is reasonable for permissions.
                    // "What are you changing relative to main?"
                    try {
                        // We need to resolve the default branch ref to SHA
                        const resolved = await git.revparse([defaultBranch]);
                        baseRev = resolved.trim();
                    } catch (e) {
                        // Default branch might not exist yet or error
                        baseRev = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
                    }
                }
            }

            // Calculate changed files
            // If deleting branch, newrev is zero, we skip check (deletion handled by branch protection)
            if (newrev !== "0000000000000000000000000000000000000000") {
                // Use --name-only to get file list
                const diff = await git.diff([
                    "--name-only",
                    baseRev,
                    newrev
                ]);
                changedFiles = diff.split('\n').filter(Boolean);
            }

        } catch (e) {
            logger.error({ err: e }, "Failed to get changed files for path protection");
            // Fail open or closed? Security usually Fail Closed.
            return new Response("Internal Server Error during permission check", { status: 500 });
        }

        if (changedFiles.length > 0) {
            // Check permissions
            // 1. Get user's teams
            const userTeams = await db.query.teamMembers.findMany({
                where: eq(schema.teamMembers.userId, userId),
                with: { team: true }
            });
            const userTeamIds = userTeams.map(tm => tm.teamId);

            // 2. Identify rules that grant access to this user
            const userAllowedRules = strictPathPermissions.filter(rule =>
                (rule.userId === userId) || (rule.teamId && userTeamIds.includes(rule.teamId))
            );

            // 3. Check each file
            for (const file of changedFiles) {
                // Find all rules that 'protect' this file (match the path)
                const protectingRules = strictPathPermissions.filter(rule =>
                    micromatch.isMatch(file, rule.pathPattern)
                );

                if (protectingRules.length > 0) {
                    // File is protected. User must match at least one ALLOWED rule that covers this file.
                    // (i.e. one of userAllowedRules must match the file)
                    const hasAccess = userAllowedRules.some(allowed =>
                        micromatch.isMatch(file, allowed.pathPattern)
                    );

                    if (!hasAccess) {
                        return new Response(`Permission denied for ${file}. Protected path.`, { status: 403 });
                    }
                }
            }
        }
    }

    return new Response("OK", { status: 200 });
};
