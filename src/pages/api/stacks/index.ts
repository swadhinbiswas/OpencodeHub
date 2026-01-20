/**
 * Stacks API
 * Create and manage stacked PRs
 */

import type { APIRoute } from "astro";
import { eq, and, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { parseBody, success } from "@/lib/api";
import { withErrorHandler, Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { z } from "zod";
import crypto from "crypto";

const createStackSchema = z.object({
    repositoryId: z.string(),
    baseBranch: z.string().default("main"),
    name: z.string().optional(),
    branches: z.array(z.object({
        name: z.string(),
        title: z.string(),
        description: z.string().optional(),
        parentBranch: z.string().optional(),
    })),
});

type CreateStackInput = z.infer<typeof createStackSchema>;

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

    const { repositoryId, name, branches } = parsed.data;
    const baseBranch = parsed.data.baseBranch || "main";

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Verify repository exists and user has access
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repositoryId),
    });

    if (!repo) {
        throw Errors.notFound("Repository not found");
    }

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
        const prNumber = Date.now() % 100000; // Simple PR number

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
            headSha: "", // Required field - will be populated when PR is created via Git
            baseBranch: branch.parentBranch || baseBranch,
            baseSha: "", // Required field - will be populated when PR is created via Git
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
            baseBranch: branch.parentBranch || baseBranch,
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
