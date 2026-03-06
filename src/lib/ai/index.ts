import { AnthropicAdapter } from "./anthropic";
import { BytezAdapter } from "./bytez";
import { ExternalAgentAdapter } from "./external-agent";
import { GoogleAdapter } from "./google";
import { GroqAdapter } from "./groq";
import { LocalAdapter } from "./local";
import { OllamaAdapter } from "./ollama";
import { OpenAIAdapter } from "./openai";
import { OpenRouterAdapter } from "./openrouter";
import { TogetherAdapter } from "./together";
import type { AIAdapter } from "./types";

export function getAIAdapter(provider: string): AIAdapter {
  switch (provider) {
    case "openai":
      return new OpenAIAdapter();
    case "groq":
      return new GroqAdapter();
    case "bytez":
      return new BytezAdapter();
    case "openrouter":
      return new OpenRouterAdapter();
    case "together":
      return new TogetherAdapter();
    case "google":
      return new GoogleAdapter();
    case "external_agent":
      return new ExternalAgentAdapter();
    case "local":
      return new LocalAdapter();
    case "anthropic":
      return new AnthropicAdapter();
    case "ollama":
      return new OllamaAdapter();
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

export * from "./types";
