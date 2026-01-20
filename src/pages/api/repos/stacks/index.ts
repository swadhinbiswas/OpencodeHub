/**
 * Stacks API - List and Create Stacks
 * GET: List all stacks for a repository
 * POST: Create a new stack
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { createStack, getRepositoryStacks } from "@/lib/stacks";
import { generateId } from "@/lib/utils";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, serverError, success, created } from "@/lib/api";

// ... existing imports ...

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return unauthorized();
    }

    const { owner, repo } = params;
    if (!owner || !repo) {
        return badRequest("Missing owner or repo");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get repository
    const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.name, repo),
    });

    if (!repository) {
        return notFound("Repository not found");
    }

    const stacks = await getRepositoryStacks(repository.id);

    return success({
        stacks: stacks.map(s => ({
            id: s.stack.id,
            name: s.stack.name,
            baseBranch: s.stack.baseBranch,
            status: s.stack.status,
            prCount: s.entries.length,
            entries: s.entries.map(e => ({
                order: e.entry.stackOrder,
                prNumber: e.pr.number,
                prTitle: e.pr.title,
                prState: e.pr.state,
            })),
            createdAt: s.stack.createdAt,
            updatedAt: s.stack.updatedAt,
        })),
    });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const user = locals.user;
    if (!user) {
        return unauthorized();
    }

    const { owner, repo } = params;
    if (!owner || !repo) {
        return badRequest("Missing owner or repo");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get repository
    const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.name, repo),
    });

    if (!repository) {
        return notFound("Repository not found");
    }

    const body = await request.json();
    const { name, baseBranch, pullRequestIds } = body;

    if (!baseBranch) {
        return badRequest("baseBranch is required");
    }

    // Create the stack
    const stack = await createStack({
        repositoryId: repository.id,
        baseBranch,
        name: name || null,
        createdById: user.id,
    });

    // Add PRs if provided
    if (pullRequestIds && Array.isArray(pullRequestIds)) {
        for (let i = 0; i < pullRequestIds.length; i++) {
            const parentPrId = i > 0 ? pullRequestIds[i - 1] : null;
            await db.insert(schema.prStackEntries).values({
                id: generateId(),
                stackId: stack.id,
                pullRequestId: pullRequestIds[i],
                stackOrder: i + 1,
                parentPrId,
                createdAt: new Date(),
            });
        }
    }

    logger.info({ userId: user.id, repoId: repository.id, stackId: stack.id, name }, "Stack created");

    return created({
        success: true,
        stack: {
            id: stack.id,
            name: stack.name,
            baseBranch: stack.baseBranch,
            status: stack.status,
        },
    });
});
