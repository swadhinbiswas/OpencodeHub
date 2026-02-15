import OpenAI from "openai"; // Groq is compatible with OpenAI SDK
import type { AIAdapter, AICompletionResult, AIConfig, AIReviewPrompt } from "./types";
import { logger } from "@/lib/logger";

export class GroqAdapter implements AIAdapter {
    async complete(prompt: AIReviewPrompt, config: AIConfig): Promise<AICompletionResult> {
        const apiKey = config.apiKey || process.env.GROQ_API_KEY;
        if (!apiKey) throw new Error("Groq API key not configured");

        // Initialize OpenAI client pointing to Groq
        const groq = new OpenAI({
            apiKey,
            baseURL: "https://api.groq.com/openai/v1"
        });

        const model = config.model || "llama3-70b-8192";

        logger.info({ model, provider: "groq" }, "Calling Groq");

        try {
            const response = await groq.chat.completions.create({
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
            logger.error({ error: error.message }, "Groq Error");
            throw error;
        }
    }
}
