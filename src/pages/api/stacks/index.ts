/**
 * Stacks API
 * Create and manage stacked PRs
 */

import type { APIRoute } from "astro";
import { eq, and, desc } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { parseBody, unauthorized, badRequest, notFound, success, serverError } from "@/lib/api";
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

// GET /api/stacks - List user's stacks
export const GET: APIRoute = async ({ request }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const url = new URL(request.url);
        const repoId = url.searchParams.get("repositoryId");

        const db = getDatabase();

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
    } catch (error) {
        console.error("List stacks error:", error);
        return serverError("Failed to list stacks");
    }
};

// POST /api/stacks - Create a new stack with PRs
export const POST: APIRoute = async ({ request }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const parsed = await parseBody(request, createStackSchema);
        if ("error" in parsed) return parsed.error;

        const { repositoryId, baseBranch, name, branches } = parsed.data;

        const db = getDatabase();

        // Verify repository exists and user has access
        const repo = await db.query.repositories.findFirst({
            where: eq(schema.repositories.id, repositoryId),
        });

        if (!repo) {
            return notFound("Repository not found");
        }

        const now = new Date().toISOString();
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

            // Create the PR
            await db.insert(schema.pullRequests).values({
                id: prId,
                repositoryId,
                number: prNumber,
                title: branch.title,
                body: branch.description || "",
                state: "open",
                authorId: tokenPayload.userId,
                headBranch: branch.name,
                baseBranch: branch.parentBranch || baseBranch,
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

        return success({
            stack: {
                id: stackId,
                name: name || `Stack ${stackId.slice(-6)}`,
                baseBranch,
                pullRequests: createdPRs,
            },
            message: `Created stack with ${createdPRs.length} PRs`,
        });
    } catch (error) {
        console.error("Create stack error:", error);
        return serverError("Failed to create stack");
    }
};
