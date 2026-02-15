import OpenAI from "openai";
import type { AIAdapter, AICompletionResult, AIConfig, AIReviewPrompt } from "./types";
import { logger } from "@/lib/logger";

export class OpenAIAdapter implements AIAdapter {
    async complete(prompt: AIReviewPrompt, config: AIConfig): Promise<AICompletionResult> {
        const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("OpenAI API key not configured");

        const openai = new OpenAI({ apiKey });

        // Default to gpt-4-turbo if not specified or invalid
        const model = config.model || "gpt-4-turbo";

        logger.info({ model, provider: "openai" }, "Calling OpenAI");

        try {
            const response = await openai.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: prompt.system },
                    { role: "user", content: prompt.user }
                ],
                temperature: config.temperature ?? 0.2,
                response_format: { type: "json_object" }
            });

            const content = response.choices[0].message.content || "{}";
            const usage = response.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 };

            return {
                content,
                usage: {
                    inputTokens: usage.prompt_tokens,
                    outputTokens: usage.completion_tokens,
                    totalTokens: usage.total_tokens
                }
            };
        } catch (error: any) {
            logger.error({ error: error.message }, "OpenAI Error");
            throw error;
        }
    }
}
