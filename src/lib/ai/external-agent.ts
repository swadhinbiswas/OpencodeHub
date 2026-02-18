import type { AIAdapter, AICompletionResult, AIConfig, AIReviewPrompt } from "./types";
import { logger } from "@/lib/logger";

type ExternalAgentResponse = {
    content?: string;
    summary?: string;
    suggestions?: unknown[];
    tokensUsed?: number;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
    };
};

export class ExternalAgentAdapter implements AIAdapter {
    async complete(prompt: AIReviewPrompt, config: AIConfig): Promise<AICompletionResult> {
        const webhookUrl = config.baseUrl || process.env.EXTERNAL_AGENT_WEBHOOK_URL;
        if (!webhookUrl) throw new Error("External agent webhook URL not configured");

        logger.info({ provider: "external_agent", webhookUrl }, "Calling external review agent");

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
            },
            body: JSON.stringify({
                provider: "opencodehub",
                model: config.model || "external-agent",
                prompt,
                metadata: {
                    source: "ai-review",
                },
            }),
        });

        // 202 is valid for async agent pipelines; mark accepted with empty suggestions.
        if (response.status === 202) {
            return {
                content: JSON.stringify({
                    summary: "External agent accepted the review request",
                    suggestions: [],
                }),
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            };
        }

        if (!response.ok) {
            throw new Error(`External agent error: ${response.status} ${await response.text()}`);
        }

        const data = (await response.json()) as ExternalAgentResponse;
        const content =
            data.content ||
            JSON.stringify({
                summary: data.summary || "External agent review completed",
                suggestions: data.suggestions || [],
            });

        const usage = data.usage || {
            totalTokens: data.tokensUsed || 0,
            inputTokens: 0,
            outputTokens: 0,
        };

        return {
            content,
            usage: {
                inputTokens: usage.inputTokens || 0,
                outputTokens: usage.outputTokens || 0,
                totalTokens: usage.totalTokens || 0,
            },
        };
    }
}
