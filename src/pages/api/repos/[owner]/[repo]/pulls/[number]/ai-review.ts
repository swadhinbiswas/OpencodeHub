
import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { success } from "@/lib/api";
import { withErrorHandler, Errors } from "@/lib/errors";
import { triggerAIReview } from "@/lib/ai-review";
import { logger } from "@/lib/logger";
import { parseAIConfigFromStorage } from "@/lib/ai-config";

export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { owner, repo: repoName, number } = params;

    // Auth check
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        throw Errors.unauthorized();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find Repo & PR
    const ownerUser = await db.query.users.findFirst({
        where: eq(schema.users.username, owner!),
    });

    if (!ownerUser) throw Errors.notFound("Repository owner not found");

    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, ownerUser.id),
            eq(schema.repositories.name, repoName!)
        ),
    });

    if (!repository) throw Errors.notFound("Repository not found");

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, parseInt(number!))
        ),
    });

    if (!pr) throw Errors.notFound("Pull request not found");

    // Trigger AI Review
    logger.info({ prId: pr.id, userId: tokenPayload.userId }, "Triggering AI review via API");

    // Fetch current user's AI config
    const currentUser = await db.query.users.findFirst({
        where: eq(schema.users.id, tokenPayload.userId),
    });

    let aiConfig = {
        provider: (process.env.AI_PROVIDER as any) || "openai",
        model: "gpt-4-turbo",
        apiKey: undefined,
    };

    if (currentUser?.aiConfig) {
        try {
            const userConfig = parseAIConfigFromStorage(currentUser.aiConfig);
            aiConfig = {
                provider: userConfig.provider || aiConfig.provider,
                model: userConfig.model || aiConfig.model,
                apiKey: userConfig.apiKeys?.[userConfig.provider],
            };
        } catch (e) {
            logger.error("Failed to parse user AI config", e);
        }
    }

    const review = await triggerAIReview(
        pr.id,
        tokenPayload.userId,
        {
            provider: aiConfig.provider,
            model: aiConfig.model,
            apiKey: aiConfig.apiKey,
            includeStackContext: true,
        }
    );

    return success({
        message: "AI Review triggered successfully",
        reviewId: review.id,
        status: review.status
    });
});
