import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { mergeBranch } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, serverError, forbidden, success, conflict } from "@/lib/api";
import { evaluateGates } from "@/lib/ci-gates";
import { closeLinkedIssuesOnMerge } from "@/lib/pr-issue-linking";

// ... existing imports ...

export const POST: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName, number } = params;
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    // Validate inputs
    if (!ownerName || !repoName || !number) {
        return badRequest("Missing parameters");
    }

    // Check repo existence and permissions
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });

    if (!repoOwner) {
        return notFound("Repository not found");
    }

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repo) {
        return notFound("Repository not found");
    }

    if (!(await canWriteRepo(user.id, repo))) {
        return forbidden();
    }

    // Get PR
    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repo.id),
            eq(schema.pullRequests.number, parseInt(number))
        )
    });

    if (!pr) {
        return notFound("Pull request not found");
    }

    if (pr.state !== "open") {
        return badRequest("Pull request is not open");
    }

    // Verify CI Gates (Strict Merge Checks)
    const gateResult = await evaluateGates(pr.id);

    if (!gateResult.canMerge) {
        const failedGates = gateResult.results
            .filter(r => !r.passed)
            .map(r => r.message)
            .join("; ");
        return conflict(`Merge blocked: ${failedGates}`);
    }



    // Merge branch
    const repoPath = await resolveRepoPath(repo.diskPath);
    const result = await mergeBranch(repoPath, pr.baseBranch, pr.headBranch);

    if (result.success) {
        // Update PR state with all merge fields
        const now = new Date();
        await db.update(schema.pullRequests)
            .set({
                state: "merged",
                isMerged: true,
                mergedAt: now,
                mergedById: user.id,
                updatedAt: now,
            })
            .where(eq(schema.pullRequests.id, pr.id));

        await closeLinkedIssuesOnMerge(pr.id, user.id);

        logger.info({ userId: user.id, repoId: repo.id, prNumber: number }, "Pull request merged");

        // Send email to author
        if (pr.authorId !== user.id) {
            const author = await db.query.users.findFirst({
                where: eq(schema.users.id, pr.authorId),
                columns: { email: true, username: true }
            });

            if (author && author.email) {
                import("@/lib/email").then(({ sendPullRequestEmail }) => {
                    const siteUrl = process.env.SITE_URL || "http://localhost:4321";
                    const prUrl = `${siteUrl}/${ownerName}/${repoName}/pulls/${number}`;

                    sendPullRequestEmail(author.email, "merged", {
                        title: pr.title,
                        number: parseInt(number),
                        url: prUrl,
                        repository: {
                            name: repoName,
                            owner: { username: ownerName }
                        },
                        author: { username: author.username }
                    }).catch(err => logger.error({ err }, "Failed to send PR merge email"));
                });
            }
        }

        // Trigger automation
        import("@/lib/automations").then(({ triggerAutomation }) => {
            triggerAutomation(repo.id, "pr_merged", {
                pullRequestId: pr.id,
                userId: user.id,
                metadata: {
                    title: pr.title,
                    number: parseInt(number),
                    baseBranch: pr.baseBranch,
                    headBranch: pr.headBranch
                }
            }).catch(err => logger.error({ err }, "Failed to trigger automation for PR merge"));
        });

        return success({ success: true });
    } else {
        return conflict(result.message);
    }
});
