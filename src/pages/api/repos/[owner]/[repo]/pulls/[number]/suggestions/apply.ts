/**
 * Code Suggestions API
 * Apply GitHub-style code suggestions to PR
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { parseBody, unauthorized, badRequest, notFound, success, serverError } from "@/lib/api";
import { z } from "zod";
import { simpleGit } from "simple-git";
import * as fs from "fs";
import * as path from "path";

const applySuggestionSchema = z.object({
    commentIds: z.array(z.string()),
    commitMessage: z.string().optional(),
});

// POST /api/repos/:owner/:repo/pulls/:number/suggestions/apply - Apply suggestions
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

// POST /api/repos/:owner/:repo/pulls/:number/suggestions/apply - Apply suggestions
export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const parsed = await parseBody(request, applySuggestionSchema);
    if ("error" in parsed) return parsed.error;

    const { owner, repo, number } = params;
    const { commentIds, commitMessage } = parsed.data;

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find PR
    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.number, parseInt(number as string)),
        with: { repository: true },
    });

    if (!pr || pr.repository?.ownerId !== owner) {
        return notFound("Pull request not found");
    }

    // Get comments with suggestions
    const comments = await db.query.pullRequestComments.findMany({
        where: (c, { inArray }) => inArray(c.id, commentIds),
    });

    const suggestions: Array<{
        path: string;
        line: number;
        code: string;
    }> = [];

    // Extract suggestions from comment bodies
    for (const comment of comments) {
        if (!comment.path || !comment.line) continue;

        // Parse ```suggestion blocks
        const suggestionMatch = comment.body.match(/```suggestion\n([\s\S]*?)\n```/);
        if (suggestionMatch) {
            suggestions.push({
                path: comment.path,
                line: comment.line,
                code: suggestionMatch[1],
            });
        }
    }

    if (suggestions.length === 0) {
        return badRequest("No suggestions found in comments");
    }

    // Apply suggestions (simplified - in production would need proper git integration)
    const git = simpleGit();
    const repoPath = pr.repository.diskPath || `/repos/${owner}/${repo}`;

    // Checkout PR branch
    await git.cwd(repoPath);
    await git.checkout(pr.headBranch);

    let appliedCount = 0;
    for (const suggestion of suggestions) {
        try {
            const filePath = path.join(repoPath, suggestion.path);
            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n");

            // Replace line with suggestion
            lines[suggestion.line - 1] = suggestion.code;

            fs.writeFileSync(filePath, lines.join("\n"));
            appliedCount++;
        } catch (err) {
            logger.error({ err, path: suggestion.path }, "Failed to apply suggestion");
        }
    }

    if (appliedCount > 0) {
        // Commit changes
        await git.add(".");
        await git.commit(
            commitMessage || `Apply ${appliedCount} code suggestion${appliedCount > 1 ? "s" : ""}`
        );

        // Push to remote
        await git.push("origin", pr.headBranch);
    }

    logger.info({ userId: tokenPayload.userId, repoId: pr.repository.id, prId: pr.id, appliedCount }, "Applied code suggestions");

    return success({
        message: `Applied ${appliedCount} suggestion${appliedCount > 1 ? "s" : ""}`,
        applied: appliedCount,
        total: suggestions.length,
    });
});
