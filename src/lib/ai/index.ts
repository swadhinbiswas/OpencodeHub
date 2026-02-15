import { OpenAIAdapter } from "./openai";
import { GroqAdapter } from "./groq";
import { BytezAdapter } from "./bytez";
import type { AIAdapter } from "./types";

export function getAIAdapter(provider: string): AIAdapter {
    switch (provider) {
        case "openai":
            return new OpenAIAdapter();
        case "groq":
            return new GroqAdapter();
        case "bytez":
            return new BytezAdapter();
        case "anthropic":
            throw new Error("Anthropic provider not implemented yet");
        default:
            throw new Error(`Unknown AI provider: ${provider}`);
    }
}

export * from "./types";
