import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { compareBranches, getCommit } from "@/lib/git";
import { canWriteRepo } from "@/lib/permissions";
import { resolveRepoPath } from "@/lib/git-storage";
import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, serverError, forbidden, created } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { autoLinkPR } from "@/lib/pr-issue-linking";
import { autoAssignReviewers } from "@/lib/multi-reviewer";
import { addToStack, createStack, getStackForPr } from "@/lib/stacks";

// ... existing imports ...

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    // Validate inputs
    if (!ownerName || !repoName) {
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

    // Parse body
    const body = await request.json();
    const { title, body: description, base, head } = body;

    if (!title || !base || !head) {
        return badRequest("Missing required fields");
    }

    if (base === head) {
        return badRequest("Base and head branches must be different");
    }

    const repoPath = await resolveRepoPath(repo.diskPath);

    // Verify branches exist and get SHAs
    // In a real implementation we should verify they exist using git.branch() or similar
    // For now we trust the client but get the SHAs via git rev-parse (or log -1)

    // Get Head SHA
    const headCommit = await getCommit(repoPath, head);
    if (!headCommit) {
        return notFound(`Head branch ${head} not found`);
    }

    // Get Base SHA
    const baseCommit = await getCommit(repoPath, base);
    if (!baseCommit) {
        return notFound(`Base branch ${base} not found`);
    }

    // Calculate diff stats
    const { diffs } = await compareBranches(repoPath, base, head);

    // Calculate stats
    let additions = 0;
    let deletions = 0;
    let changedFiles = 0;

    diffs.forEach(diff => {
        additions += diff.additions;
        deletions += diff.deletions;
        changedFiles++;
    });

    // Determine PR number
    const lastPr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.repositoryId, repo.id),
        orderBy: [desc(schema.pullRequests.number)],
    });

    const number = (lastPr?.number || 0) + 1;

    // Create PR
    const prId = nanoid();
    await db.insert(schema.pullRequests).values({
        id: prId,
        repositoryId: repo.id,
        number,
        title,
        body: description || "",
        state: "open",
        authorId: user.id,
        headBranch: head,
        headSha: headCommit.sha,
        baseBranch: base,
        baseSha: baseCommit.sha,
        additions,
        deletions,
        changedFiles
    });

    // Auto-detect PR dependencies (stack if base matches another PR's head)
    try {
        const parentPr = await db.query.pullRequests.findFirst({
            where: and(
                eq(schema.pullRequests.repositoryId, repo.id),
                eq(schema.pullRequests.headBranch, base),
                eq(schema.pullRequests.state, "open")
            ),
        });

        if (parentPr) {
            const existingStack = await getStackForPr(parentPr.id);
            if (existingStack) {
                await addToStack({
                    stackId: existingStack.stack.id,
                    pullRequestId: prId,
                    parentPrId: parentPr.id,
                });
            } else {
                const stack = await createStack({
                    repositoryId: repo.id,
                    baseBranch: parentPr.baseBranch,
                    name: `Stack for ${parentPr.title}`,
                    createdById: user.id,
                });

                await addToStack({
                    stackId: stack.id,
                    pullRequestId: parentPr.id,
                });
                await addToStack({
                    stackId: stack.id,
                    pullRequestId: prId,
                    parentPrId: parentPr.id,
                });
            }
        }
    } catch (error) {
        logger.warn({ prId, error }, "Failed to auto-detect PR dependency");
    }

    try {
        const reviewerRules = await db.query.reviewerRules.findMany({
            where: and(
                eq(schema.reviewerRules.repositoryId, repo.id),
                eq(schema.reviewerRules.isEnabled, true)
            ),
        });

        const rules = reviewerRules.map((rule) => ({
            type: rule.ruleType as "user" | "team" | "codeowner" | "random",
            targetId: rule.targetId || undefined,
            count: rule.count || undefined,
            pathPattern: rule.pathPattern || undefined,
        }));

        await autoAssignReviewers(prId, rules, diffs.map((diff) => diff.file));
    } catch (error) {
        logger.warn({ prId, error }, "Failed to auto-assign reviewers");
    }

    logger.info({ userId: user.id, repoId: repo.id, prNumber: number }, "Pull request created");

    // Send email notification to repo owner
    if (repoOwner.email && repoOwner.id !== user.id) {
        // Fire and forget
        import("@/lib/email").then(({ sendPullRequestEmail }) => {
            const siteUrl = process.env.SITE_URL || "http://localhost:4321";
            const prUrl = `${siteUrl}/${ownerName}/${repoName}/pulls/${number}`;

            sendPullRequestEmail(repoOwner.email, "opened", {
                title,
                number,
                url: prUrl,
                repository: {
                    name: repoName,
                    owner: { username: ownerName }
                },
                author: { username: user.username }
            }).catch(err => logger.error({ err }, "Failed to send PR email"));
        });
    }

    // Trigger automation
    import("@/lib/automations").then(({ triggerAutomation }) => {
        triggerAutomation(repo.id, "pr_opened", {
            pullRequestId: prId,
            userId: user.id,
            metadata: {
                title,
                base,
                head,
                number
            }
        }).catch(err => logger.error({ err }, "Failed to trigger automation for PR creation"));
    });

    // Log activity
    await logActivity(
        user.id,
        "open_pr",
        "opened",
        "pull_request",
        prId,
        repo.id,
        { number, title, additions, deletions, changedFiles },
        "branch",
        head
    );

    // Auto-link issues referenced in PR title/body (best effort)
    try {
        await autoLinkPR(prId, user.id);
    } catch (error) {
        logger.warn({ prId, error }, "Failed to auto-link issues for PR");
    }

    return created({ id: prId, number });
});
