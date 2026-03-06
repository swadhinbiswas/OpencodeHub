/**
 * Ollama AI Adapter — Local LLM provider
 *
 * Connects to a locally-running Ollama instance for private,
 * cost-free AI code reviews. No data leaves your infrastructure.
 */

import type {
  AIAdapter,
  AICompletionResult,
  AIConfig,
  AIReviewPrompt,
} from "./types";

export class OllamaAdapter implements AIAdapter {
  async complete(
    prompt: AIReviewPrompt,
    config: AIConfig,
  ): Promise<AICompletionResult> {
    const baseUrl =
      config.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = config.model || process.env.OLLAMA_MODEL || "codellama:13b";

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        stream: false,
        options: {
          temperature: config.temperature ?? 0.1,
          num_predict: config.maxTokens ?? 4096,
        },
        format: "json",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.message?.content || "",
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }
}
