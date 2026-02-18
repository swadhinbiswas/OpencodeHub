import type { AIAdapter, AICompletionResult, AIConfig, AIReviewPrompt } from "./types";
import { logger } from "@/lib/logger";

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export class AnthropicAdapter implements AIAdapter {
  async complete(prompt: AIReviewPrompt, config: AIConfig): Promise<AICompletionResult> {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Anthropic API key not configured");

    const model = config.model || "claude-3-5-sonnet-latest";
    const maxTokens = config.maxTokens ?? 2048;

    logger.info({ model, provider: "anthropic" }, "Calling Anthropic");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: config.temperature ?? 0.2,
          system: prompt.system,
          messages: [
            {
              role: "user",
              content: prompt.user,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API Error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as AnthropicResponse;
      const content =
        data.content
          ?.filter((c) => c.type === "text" && c.text)
          .map((c) => c.text)
          .join("\n")
          .trim() || "{}";

      const inputTokens = data.usage?.input_tokens ?? 0;
      const outputTokens = data.usage?.output_tokens ?? 0;

      return {
        content,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message }, "Anthropic Error");
      throw error;
    }
  }
}
