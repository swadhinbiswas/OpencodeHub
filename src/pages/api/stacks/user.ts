import { getDatabase, schema } from "@/db";
import { type APIContext } from "astro";
import { and, desc, eq, inArray } from "drizzle-orm";
import { success, error, unauthorized } from "@/lib/api";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const GET = withErrorHandler(async ({ locals }: APIContext) => {
    const user = locals.user;
    if (!user) {
        return unauthorized();
    }

    const db = getDatabase();

    // 1. Find all PRs created by the user
    const userPrs = await db.query.pullRequests.findMany({
        where: eq(schema.pullRequests.authorId, user.id),
        columns: { id: true }
    });

    if (userPrs.length === 0) {
        return success([]);
    }

    const prIds = userPrs.map(pr => pr.id);

    // 2. Find which stacks these PRs belong to
    // We get unique stackIds from stack entries
    const stackEntries = await db.query.prStackEntries.findMany({
        where: inArray(schema.prStackEntries.pullRequestId, prIds),
        columns: { stackId: true }
    });

    const uniqueStackIds = [...new Set(stackEntries.map(e => e.stackId))];

    if (uniqueStackIds.length === 0) {
        return success([]);
    }

    // 3. Fetch full stack details + all entries (to show full context of the stack)
    // We need to fetch the stack info AND all its entries (even PRs not owned by current user, if that ever happens)
    const stacks = await db.query.prStacks.findMany({
        where: inArray(schema.prStacks.id, uniqueStackIds),
        orderBy: [desc(schema.prStacks.updatedAt)],
        with: {
            repository: {
                with: {
                    owner: true
                }
            },
            entries: {
                orderBy: (entries, { asc }) => [asc(entries.stackOrder)],
                with: {
                    pullRequest: true
                }
            }
        }
    });

    // 4. Format response for UI
    const formattedStacks = stacks.map(stack => {
        return {
            id: stack.id,
            name: stack.name || `Stack-${stack.id.substring(0, 6)}`, // Fallback name
            baseBranch: stack.baseBranch,
            status: stack.status,
            repoName: stack.repository.name,
            repoOwner: stack.repository.owner.username,
            updatedAt: stack.updatedAt,
            prs: stack.entries.map(entry => ({
                id: entry.pullRequest.id,
                number: entry.pullRequest.number,
                title: entry.pullRequest.title,
                status: entry.pullRequest.state, // 'open', 'closed', 'merged'
                url: `/${stack.repository.owner.username}/${stack.repository.name}/pulls/${entry.pullRequest.number}`,
                position: entry.stackOrder,
                isMerged: entry.pullRequest.state === 'merged',
                isClosed: entry.pullRequest.state === 'closed',
            }))
        };
    });

    return success(formattedStacks);
});
