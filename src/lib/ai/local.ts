import OpenAI from "openai";
import type { AIAdapter, AICompletionResult, AIConfig, AIReviewPrompt } from "./types";
import { logger } from "@/lib/logger";

export class LocalAdapter implements AIAdapter {
    async complete(prompt: AIReviewPrompt, config: AIConfig): Promise<AICompletionResult> {
        const baseURL = config.baseUrl || process.env.LOCAL_AI_BASE_URL || "http://127.0.0.1:11434/v1";
        const apiKey = config.apiKey || process.env.LOCAL_AI_API_KEY || "ollama";

        const client = new OpenAI({
            apiKey,
            baseURL,
        });

        const model = config.model || "llama3.1";
        logger.info({ model, provider: "local", baseURL }, "Calling local OpenAI-compatible model");

        const response = await client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: prompt.system },
                { role: "user", content: prompt.user },
            ],
            temperature: config.temperature ?? 0.2,
        });

        const content = response.choices[0]?.message?.content || "{}";
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
