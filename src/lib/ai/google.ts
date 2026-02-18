import type { AIAdapter, AICompletionResult, AIConfig, AIReviewPrompt } from "./types";
import { logger } from "@/lib/logger";

type GeminiResponse = {
    candidates?: Array<{
        content?: {
            parts?: Array<{ text?: string }>;
        };
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
    };
};

export class GoogleAdapter implements AIAdapter {
    async complete(prompt: AIReviewPrompt, config: AIConfig): Promise<AICompletionResult> {
        const apiKey = config.apiKey || process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) throw new Error("Google AI API key not configured");

        const model = config.model || "gemini-1.5-flash";
        logger.info({ model, provider: "google" }, "Calling Google AI");

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    generationConfig: {
                        temperature: config.temperature ?? 0.2,
                        responseMimeType: "application/json",
                    },
                    systemInstruction: {
                        parts: [{ text: prompt.system }],
                    },
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: prompt.user }],
                        },
                    ],
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Google AI API Error: ${response.status} ${await response.text()}`);
        }

        const data = (await response.json()) as GeminiResponse;
        const content =
            data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() || "{}";

        const usage = data.usageMetadata || {};
        const inputTokens = usage.promptTokenCount ?? 0;
        const outputTokens = usage.candidatesTokenCount ?? 0;
        const totalTokens = usage.totalTokenCount ?? inputTokens + outputTokens;

        return {
            content,
            usage: {
                inputTokens,
                outputTokens,
                totalTokens,
            },
        };
    }
}
