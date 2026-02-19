import { describe, expect, it } from "vitest";
import { getAIAdapter } from "@/lib/ai";
import { LocalAdapter } from "@/lib/ai/local";

describe("ai adapter registry", () => {
  it("returns local adapter for local provider", () => {
    const adapter = getAIAdapter("local");
    expect(adapter).toBeInstanceOf(LocalAdapter);
  });

  it("throws for unknown providers", () => {
    expect(() => getAIAdapter("unknown-provider")).toThrow(/Unknown AI provider/i);
  });
});
