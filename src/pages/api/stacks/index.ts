/**
 * Stacks API
 * Create and manage stacked PRs
 */

import type { APIRoute } from "astro";
import { eq, and, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";
import { compareBranches, getCommit } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { parseBody, success } from "@/lib/api";
import { withErrorHandler, Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { z } from "zod";
import crypto from "crypto";

const createStackSchema = z.object({
    repositoryId: z.string().optional(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    baseBranch: z.string().default("main"),
    name: z.string().optional(),
    branches: z.array(z.object({
        name: z.string(),
        title: z.string(),
        description: z.string().optional(),
        parentBranch: z.string().optional(),
    })),
}).refine(data => data.repositoryId || (data.owner && data.repo), {
    message: "Either repositoryId or owner and repo must be provided",
});


// GET /api/stacks - List user's stacks
export const GET: APIRoute = withErrorHandler(async ({ request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        throw Errors.unauthorized();
    }

    const url = new URL(request.url);
    const repoId = url.searchParams.get("repositoryId");

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    let stacks;
    if (repoId) {
        stacks = await db.query.prStacks.findMany({
            where: and(
                eq(schema.prStacks.repositoryId, repoId),
                eq(schema.prStacks.createdById, tokenPayload.userId)
            ),
            with: {
                entries: {
                    with: {
                        pullRequest: true,
                    },
                    orderBy: (e, { asc }) => [asc(e.stackOrder)],
                },
            },
            orderBy: [desc(schema.prStacks.updatedAt)],
        });
    } else {
        stacks = await db.query.prStacks.findMany({
            where: eq(schema.prStacks.createdById, tokenPayload.userId),
            with: {
                repository: true,
                entries: {
                    with: {
                        pullRequest: true,
                    },
                    orderBy: (e, { asc }) => [asc(e.stackOrder)],
                },
            },
            orderBy: [desc(schema.prStacks.updatedAt)],
        });
    }

    return success({ stacks });
});

// POST /api/stacks - Create a new stack with PRs
export const POST: APIRoute = withErrorHandler(async ({ request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        throw Errors.unauthorized();
    }

    const parsed = await parseBody(request, createStackSchema);
    if ("error" in parsed) return parsed.error;

    const { name, branches } = parsed.data;
    const baseBranch = parsed.data.baseBranch || "main";
    let repositoryId = parsed.data.repositoryId;

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find repo by owner/name if only provided
    if (!repositoryId && parsed.data.owner && parsed.data.repo) {
        const ownerUser = await db.query.users.findFirst({
            where: eq(schema.users.username, parsed.data.owner),
        });

        if (ownerUser) {
            const repo = await db.query.repositories.findFirst({
                where: and(
                    eq(schema.repositories.ownerId, ownerUser.id),
                    eq(schema.repositories.name, parsed.data.repo)
                ),
            });
            if (repo) {
                repositoryId = repo.id;
            }
        }
    }

    if (!repositoryId) {
        throw Errors.notFound("Repository not found");
    }

    // Verify repository exists and user has access
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repositoryId),
    });

    if (!repo) {
        throw Errors.notFound("Repository not found");
    }

    if (!(await canWriteRepo(tokenPayload.userId, repo, { isAdmin: tokenPayload.isAdmin }))) {
        throw Errors.forbidden();
    }

    const repoPath = await resolveRepoPath(repo.diskPath);
    const lastPr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.repositoryId, repositoryId),
        orderBy: [desc(schema.pullRequests.number)],
    });
    let nextPrNumber = (lastPr?.number || 0) + 1;

    const now = new Date();
    const stackId = `stack_${crypto.randomBytes(8).toString("hex")}`;

    // Create the stack
    await db.insert(schema.prStacks).values({
        id: stackId,
        repositoryId,
        baseBranch,
        name: name || `Stack ${stackId.slice(-6)}`,
        status: "active",
        createdById: tokenPayload.userId,
        createdAt: now,
        updatedAt: now,
    });

    // Create PRs for each branch
    const createdPRs: any[] = [];
    let parentPrId: string | null = null;
    let stackOrder = 1;

    for (const branch of branches) {
        const prId = `pr_${crypto.randomBytes(8).toString("hex")}`;
        const prNumber = nextPrNumber++;
        const prBaseBranch = branch.parentBranch || baseBranch;

        const headCommit = await getCommit(repoPath, branch.name);
        if (!headCommit) {
            throw Errors.badRequest(`Head branch ${branch.name} not found`);
        }

        const baseCommit = await getCommit(repoPath, prBaseBranch);
        if (!baseCommit) {
            throw Errors.badRequest(`Base branch ${prBaseBranch} not found`);
        }

        const { diffs } = await compareBranches(repoPath, prBaseBranch, branch.name);
        const additions = diffs.reduce((sum, diff) => sum + diff.additions, 0);
        const deletions = diffs.reduce((sum, diff) => sum + diff.deletions, 0);
        const changedFiles = diffs.length;

        // Create the PR with required schema fields
        await db.insert(schema.pullRequests).values({
            id: prId,
            repositoryId,
            number: prNumber,
            title: branch.title,
            body: branch.description || "",
            state: "open",
            authorId: tokenPayload.userId,
            headBranch: branch.name,
            headSha: headCommit.sha,
            baseBranch: prBaseBranch,
            baseSha: baseCommit.sha,
            additions,
            deletions,
            changedFiles,
            isDraft: false,
            createdAt: now,
            updatedAt: now,
        });

        // Add to stack
        await db.insert(schema.prStackEntries).values({
            id: `se_${crypto.randomBytes(8).toString("hex")}`,
            stackId,
            pullRequestId: prId,
            stackOrder,
            parentPrId,
            createdAt: now,
        });

        createdPRs.push({
            id: prId,
            number: prNumber,
            title: branch.title,
            branch: branch.name,
            baseBranch: prBaseBranch,
            stackOrder,
        });

        parentPrId = prId;
        stackOrder++;
    }

    logger.info({ stackId, userId: tokenPayload.userId }, "Stacked PR created");

    return success({
        stack: {
            id: stackId,
            name: name || `Stack ${stackId.slice(-6)}`,
            baseBranch,
            pullRequests: createdPRs,
        },
        message: `Created stack with ${createdPRs.length} PRs`,
    });
});
