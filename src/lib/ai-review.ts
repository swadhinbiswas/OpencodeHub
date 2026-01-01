/**
 * AI Code Review Library
 * LLM-powered code review with stack context and inline suggestions
 */

import { eq, and, desc } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";
import { generateId } from "./utils";
import { getStackForPr } from "./stacks";

// Supported AI providers
export type AIProvider = "openai" | "anthropic" | "local";
export type AIModel = "gpt-4" | "gpt-4-turbo" | "claude-3-opus" | "claude-3-sonnet" | "local";

export interface AIReviewConfig {
    provider: AIProvider;
    model: AIModel;
    apiKey?: string;
    baseUrl?: string; // For local models
    includeStackContext?: boolean;
}

export interface ReviewSuggestion {
    path: string;
    line?: number;
    endLine?: number;
    severity: "info" | "warning" | "error" | "critical";
    type: "bug" | "security" | "performance" | "style" | "documentation" | "suggestion";
    title: string;
    message: string;
    suggestedFix?: string;
    explanation?: string;
}

export interface AIReviewResult {
    reviewId: string;
    summary: string;
    overallSeverity: "info" | "warning" | "error" | "critical";
    suggestions: ReviewSuggestion[];
    tokensUsed: number;
}

/**
 * Trigger an AI review for a pull request
 */
export async function triggerAIReview(
    pullRequestId: string,
    triggeredById: string,
    config: AIReviewConfig
): Promise<typeof schema.aiReviews.$inferSelect> {
    const db = getDatabase();

    // Create review record
    const reviewId = generateId();
    const review = {
        id: reviewId,
        pullRequestId,
        status: "pending",
        model: config.model,
        provider: config.provider,
        includesStackContext: config.includeStackContext || false,
        triggeredById,
        createdAt: new Date().toISOString(),
    };

    await db.insert(schema.aiReviews).values(review);

    // Start the review asynchronously
    // In production, this would be queued to a background job
    runAIReview(reviewId, pullRequestId, config).catch(console.error);

    return review as typeof schema.aiReviews.$inferSelect;
}

/**
 * Run the AI review (called asynchronously)
 */
async function runAIReview(
    reviewId: string,
    pullRequestId: string,
    config: AIReviewConfig
): Promise<void> {
    const db = getDatabase();

    try {
        // Mark as running
        await db.update(schema.aiReviews)
            .set({ status: "running", startedAt: new Date().toISOString() })
            .where(eq(schema.aiReviews.id, reviewId));

        // Get PR and diff
        const pr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.id, pullRequestId),
        });

        if (!pr) {
            throw new Error("PR not found");
        }

        // Get stack context if enabled
        let stackContext = null;
        if (config.includeStackContext) {
            const stackInfo = await getStackForPr(pullRequestId);
            if (stackInfo) {
                stackContext = JSON.stringify({
                    stackName: stackInfo.stack.name,
                    baseBranch: stackInfo.stack.baseBranch,
                    prsInStack: stackInfo.entries.map(e => ({
                        number: e.pr.number,
                        title: e.pr.title,
                        state: e.pr.state,
                    })),
                });
            }
        }

        // Generate review prompt
        const prompt = generateReviewPrompt(pr, stackContext);

        // Call AI provider
        const result = await callAIProvider(config, prompt);

        // Parse and save suggestions
        const suggestions = parseAIResponse(result.content);

        for (const suggestion of suggestions) {
            await db.insert(schema.aiReviewSuggestions).values({
                id: generateId(),
                aiReviewId: reviewId,
                path: suggestion.path,
                line: suggestion.line,
                endLine: suggestion.endLine,
                severity: suggestion.severity,
                type: suggestion.type,
                title: suggestion.title,
                message: suggestion.message,
                suggestedFix: suggestion.suggestedFix,
                explanation: suggestion.explanation,
                createdAt: new Date().toISOString(),
            });
        }

        // Determine overall severity
        const severityOrder: Array<"info" | "warning" | "error" | "critical"> = ["info", "warning", "error", "critical"];
        let maxSeverity: "info" | "warning" | "error" | "critical" = "info";
        for (const s of suggestions) {
            if (severityOrder.indexOf(s.severity) > severityOrder.indexOf(maxSeverity)) {
                maxSeverity = s.severity;
            }
        }

        // Update review with results
        await db.update(schema.aiReviews)
            .set({
                status: "completed",
                summary: result.summary,
                overallSeverity: maxSeverity,
                suggestionsCount: suggestions.length,
                tokensUsed: result.tokensUsed,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                stackContext,
                completedAt: new Date().toISOString(),
            })
            .where(eq(schema.aiReviews.id, reviewId));

    } catch (error) {
        console.error("AI review failed:", error);
        await db.update(schema.aiReviews)
            .set({
                status: "failed",
                errorMessage: error instanceof Error ? error.message : "Unknown error",
                completedAt: new Date().toISOString(),
            })
            .where(eq(schema.aiReviews.id, reviewId));
    }
}

/**
 * Generate the review prompt
 */
function generateReviewPrompt(
    pr: typeof schema.pullRequests.$inferSelect,
    stackContext: string | null
): string {
    let prompt = `You are a senior code reviewer. Review the following pull request and provide actionable feedback.

## Pull Request
- Title: ${pr.title}
- Description: ${pr.body || "No description"}
- Branch: ${pr.headBranch} → ${pr.baseBranch}
- Changes: +${pr.additions} -${pr.deletions} in ${pr.changedFiles} files
`;

    if (stackContext) {
        prompt += `
## Stack Context
This PR is part of a stack:
${stackContext}
`;
    }

    prompt += `
## Review Instructions
1. Identify bugs, security issues, performance problems, and style issues
2. For each issue, provide:
   - File path and line number (if applicable)
   - Severity: info, warning, error, or critical
   - Type: bug, security, performance, style, documentation, or suggestion
   - Clear explanation
   - Suggested fix (code snippet if applicable)
3. Provide a brief summary at the end

## Response Format
Respond in JSON format:
{
  "summary": "Brief overall assessment",
  "suggestions": [
    {
      "path": "src/example.ts",
      "line": 42,
      "severity": "warning",
      "type": "bug",
      "title": "Potential null pointer",
      "message": "Variable may be null here",
      "suggestedFix": "if (value !== null) { ... }",
      "explanation": "This could cause a runtime error"
    }
  ]
}

Review the code carefully:
`;

    // Note: In production, you would include the actual diff here
    // For now, we're using a placeholder
    prompt += "\n[DIFF PLACEHOLDER - In production, include actual file changes]";

    return prompt;
}

/**
 * Call the AI provider
 */
async function callAIProvider(
    config: AIReviewConfig,
    prompt: string
): Promise<{
    content: string;
    summary: string;
    tokensUsed: number;
    promptTokens: number;
    completionTokens: number;
}> {
    // In production, implement actual API calls
    // For now, return a mock response

    logger.info({ provider: config.provider, model: config.model, promptLength: prompt.length }, "Calling AI provider");

    // Mock response for testing
    const mockResponse = {
        summary: "This PR looks good overall with a few minor suggestions.",
        suggestions: [
            {
                path: "src/example.ts",
                line: 10,
                severity: "info",
                type: "style",
                title: "Consider using const",
                message: "This variable is never reassigned, consider using const instead of let",
                suggestedFix: "const value = getData();",
                explanation: "Using const makes code intent clearer"
            }
        ]
    };

    return {
        content: JSON.stringify(mockResponse),
        summary: mockResponse.summary,
        tokensUsed: 150,
        promptTokens: 100,
        completionTokens: 50,
    };
}

/**
 * Parse AI response into suggestions
 */
function parseAIResponse(content: string): ReviewSuggestion[] {
    try {
        const parsed = JSON.parse(content);
        return parsed.suggestions || [];
    } catch {
        console.error("Failed to parse AI response:", content);
        return [];
    }
}

/**
 * Get the latest AI review for a PR
 */
export async function getLatestAIReview(pullRequestId: string): Promise<{
    review: typeof schema.aiReviews.$inferSelect;
    suggestions: typeof schema.aiReviewSuggestions.$inferSelect[];
} | null> {
    const db = getDatabase();

    const review = await db.query.aiReviews.findFirst({
        where: eq(schema.aiReviews.pullRequestId, pullRequestId),
        orderBy: [desc(schema.aiReviews.createdAt)],
    });

    if (!review) return null;

    const suggestions = await db.query.aiReviewSuggestions.findMany({
        where: eq(schema.aiReviewSuggestions.aiReviewId, review.id),
    });

    return { review, suggestions };
}

/**
 * Apply an AI suggestion (mark as applied)
 */
export async function applyAISuggestion(
    suggestionId: string,
    appliedById: string
): Promise<void> {
    const db = getDatabase();

    await db.update(schema.aiReviewSuggestions)
        .set({
            isApplied: true,
            appliedAt: new Date().toISOString(),
            appliedById,
        })
        .where(eq(schema.aiReviewSuggestions.id, suggestionId));
}

/**
 * Dismiss an AI suggestion
 */
export async function dismissAISuggestion(
    suggestionId: string,
    dismissedById: string,
    reason?: string
): Promise<void> {
    const db = getDatabase();

    await db.update(schema.aiReviewSuggestions)
        .set({
            isDismissed: true,
            dismissedAt: new Date().toISOString(),
            dismissedById,
            dismissReason: reason,
        })
        .where(eq(schema.aiReviewSuggestions.id, suggestionId));
}
