export interface AIConfig {
  provider:
    | "openai"
    | "groq"
    | "bytez"
    | "openrouter"
    | "together"
    | "google"
    | "external_agent"
    | "local"
    | "anthropic"
    | "ollama";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIReviewPrompt {
  system: string;
  user: string;
}

export interface AICompletionResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface AIAdapter {
  complete(
    prompt: AIReviewPrompt,
    config: AIConfig,
  ): Promise<AICompletionResult>;
}
