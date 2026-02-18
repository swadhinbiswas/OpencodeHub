import OpenAI from "openai";
import type { AIAdapter, AICompletionResult, AIConfig, AIReviewPrompt } from "./types";
import { logger } from "@/lib/logger";

export class OpenRouterAdapter implements AIAdapter {
    async complete(prompt: AIReviewPrompt, config: AIConfig): Promise<AICompletionResult> {
        const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error("OpenRouter API key not configured");

        const client = new OpenAI({
            apiKey,
            baseURL: "https://openrouter.ai/api/v1",
        });

        const model = config.model || "meta-llama/llama-3.1-8b-instruct:free";
        logger.info({ model, provider: "openrouter" }, "Calling OpenRouter");

        const response = await client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: prompt.system },
                { role: "user", content: prompt.user },
            ],
            temperature: config.temperature ?? 0.2,
            response_format: { type: "json_object" },
        });

        const content = response.choices[0].message.content || "{}";
        const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        return {
            content,
            usage: {
                inputTokens: usage.prompt_tokens,
                outputTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens,
            },
        };
    }
}
