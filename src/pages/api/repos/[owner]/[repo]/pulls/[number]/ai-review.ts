
import type { APIRoute } from "astro";
import { eq, and, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { success } from "@/lib/api";
import { withErrorHandler, Errors } from "@/lib/errors";
import { triggerAIReview } from "@/lib/ai-review";
import type { AIProvider } from "@/lib/ai-review";
import { logger } from "@/lib/logger";
import { parseAIConfigFromStorage } from "@/lib/ai-config";
import { canReadRepo } from "@/lib/permissions";

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner, repo: repoName, number } = params;
    const user = locals.user;
    const prNumber = Number.parseInt(number || "", 10);
    if (!owner || !repoName || Number.isNaN(prNumber)) {
        throw Errors.badRequest("Invalid repository or pull request");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const ownerUser = await db.query.users.findFirst({
        where: eq(schema.users.username, owner),
        columns: { id: true },
    });
    if (!ownerUser) throw Errors.notFound("Repository owner not found");

    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, ownerUser.id),
            eq(schema.repositories.name, repoName)
        ),
        with: { owner: true },
    });
    if (!repository) throw Errors.notFound("Repository not found");

    if (!(await canReadRepo(user?.id, repository, { isAdmin: user?.isAdmin }))) {
        throw Errors.forbidden("Access denied");
    }

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, prNumber)
        ),
    });
    if (!pr) throw Errors.notFound("Pull request not found");

    const review = await db.query.aiReviews.findFirst({
        where: eq(schema.aiReviews.pullRequestId, pr.id),
        orderBy: [desc(schema.aiReviews.createdAt)],
    });

    if (!review) return success(null);

    const suggestions = await db.query.aiReviewSuggestions.findMany({
        where: eq(schema.aiReviewSuggestions.aiReviewId, review.id),
    });

    return success({ review, suggestions });
});

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

    let aiConfig: {
        provider: AIProvider;
        model: string;
        apiKey?: string;
        baseUrl?: string;
    } = {
        provider: ((process.env.AI_PROVIDER as AIProvider | undefined) || "openai"),
        model: "gpt-4-turbo",
        apiKey: undefined,
        baseUrl: process.env.EXTERNAL_AGENT_WEBHOOK_URL,
    };

    if (currentUser?.aiConfig) {
        try {
            const userConfig = parseAIConfigFromStorage(currentUser.aiConfig);
            const provider: AIProvider =
                userConfig.provider === "openai" ||
                userConfig.provider === "anthropic" ||
                userConfig.provider === "groq" ||
                userConfig.provider === "bytez" ||
                userConfig.provider === "openrouter" ||
                userConfig.provider === "together" ||
                userConfig.provider === "google" ||
                userConfig.provider === "external_agent" ||
                userConfig.provider === "local"
                    ? userConfig.provider
                    : "openai";
            const keyProvider =
                provider === "openai" ||
                provider === "anthropic" ||
                provider === "groq" ||
                provider === "bytez" ||
                provider === "openrouter" ||
                provider === "together" ||
                provider === "google"
                    ? provider
                    : provider === "external_agent"
                        ? "externalAgent"
                    : undefined;
            aiConfig = {
                provider,
                model: userConfig.model || aiConfig.model,
                apiKey: keyProvider ? userConfig.apiKeys?.[keyProvider] : undefined,
                baseUrl:
                    provider === "external_agent"
                        ? (userConfig.externalAgentWebhookUrl || aiConfig.baseUrl)
                        : undefined,
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
            baseUrl: aiConfig.baseUrl,
            includeStackContext: true,
        }
    );

    return success({
        message: "AI Review triggered successfully",
        reviewId: review.id,
        status: review.status
    });
});
