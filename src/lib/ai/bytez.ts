import type { AIAdapter, AICompletionResult, AIConfig, AIReviewPrompt } from "./types";
import { logger } from "@/lib/logger";

export class BytezAdapter implements AIAdapter {
    async complete(prompt: AIReviewPrompt, config: AIConfig): Promise<AICompletionResult> {
        const apiKey = config.apiKey || process.env.BYTEZ_API_KEY;
        if (!apiKey) throw new Error("Bytez API key not configured");

        const model = config.model || "meta-llama/Meta-Llama-3-70B-Instruct";

        logger.info({ model, provider: "bytez" }, "Calling Bytez");

        try {
            const response = await fetch("https://api.bytez.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: "system", content: prompt.system },
                        { role: "user", content: prompt.user }
                    ],
                    temperature: config.temperature ?? 0.2,
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Bytez API Error: ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || "{}";
            const usage = data.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 };

            return {
                content,
                usage: {
                    inputTokens: usage.prompt_tokens,
                    outputTokens: usage.completion_tokens,
                    totalTokens: usage.total_tokens
                }
            };
        } catch (error: any) {
            logger.error({ error: error.message }, "Bytez Error");
            throw error;
        }
    }
}
