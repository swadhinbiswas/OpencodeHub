import { describe, expect, it } from "vitest";
import {
  buildStoredAIConfig,
  parseAIConfigFromStorage,
  sanitizeAIConfigForClient,
} from "@/lib/ai-config";

describe("ai-config security", () => {
  it("encrypts keys at rest and decrypts on read", () => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = "test-encryption-key-for-unit-tests";

    const stored = buildStoredAIConfig({
      provider: "openai",
      model: "gpt-4-turbo",
      apiKeys: {
        openai: "sk-test-super-secret",
      },
    });

    expect(stored).not.toContain("sk-test-super-secret");

    const parsed = parseAIConfigFromStorage(stored);
    expect(parsed.apiKeys.openai).toBe("sk-test-super-secret");
  });

  it("supports legacy plaintext values for backward compatibility", () => {
    const legacy = JSON.stringify({
      provider: "openai",
      model: "gpt-4-turbo",
      apiKeys: { openai: "sk-legacy-plain" },
    });

    const parsed = parseAIConfigFromStorage(legacy);
    expect(parsed.apiKeys.openai).toBe("sk-legacy-plain");
  });

  it("sanitizes config for client responses", () => {
    const redacted = sanitizeAIConfigForClient({
      provider: "openai",
      model: "gpt-4-turbo",
      apiKeys: {
        openai: "sk-test-super-secret",
      },
    });

    expect(redacted.apiKeys.openai.isSet).toBe(true);
    expect(redacted.apiKeys.openai.masked).toBe("••••cret");
    expect(redacted.apiKeys.groq.isSet).toBe(false);
  });
});

