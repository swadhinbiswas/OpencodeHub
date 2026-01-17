/**
 * Stacks API - List and Create Stacks
 * GET: List all stacks for a repository
 * POST: Create a new stack
 */

import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { createStack, getRepositoryStacks } from "@/lib/stacks";
import { generateId } from "@/lib/utils";

export const GET: APIRoute = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { owner, repo } = params;
    if (!owner || !repo) {
        return new Response(JSON.stringify({ error: "Missing owner or repo" }), { status: 400 });
    }

    const db = getDatabase();

    // Get repository
    const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.name, repo),
    });

    if (!repository) {
        return new Response(JSON.stringify({ error: "Repository not found" }), { status: 404 });
    }

    try {
        const stacks = await getRepositoryStacks(repository.id);

        return new Response(JSON.stringify({
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
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error fetching stacks:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch stacks" }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ params, locals, request }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { owner, repo } = params;
    if (!owner || !repo) {
        return new Response(JSON.stringify({ error: "Missing owner or repo" }), { status: 400 });
    }

    const db = getDatabase();

    // Get repository
    const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.name, repo),
    });

    if (!repository) {
        return new Response(JSON.stringify({ error: "Repository not found" }), { status: 404 });
    }

    try {
        const body = await request.json();
        const { name, baseBranch, pullRequestIds } = body;

        if (!baseBranch) {
            return new Response(JSON.stringify({ error: "baseBranch is required" }), { status: 400 });
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
                    createdAt: new Date().toISOString(),
                });
            }
        }

        return new Response(JSON.stringify({
            success: true,
            stack: {
                id: stack.id,
                name: stack.name,
                baseBranch: stack.baseBranch,
                status: stack.status,
            },
        }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error creating stack:", error);
        return new Response(JSON.stringify({ error: "Failed to create stack" }), { status: 500 });
    }
};
