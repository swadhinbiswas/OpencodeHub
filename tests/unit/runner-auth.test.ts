import { describe, expect, it } from "vitest";
import { generateRunnerToken, verifyRunnerToken } from "@/lib/runner-auth";

describe("runner-auth", () => {
  it("rejects missing token", () => {
    expect(verifyRunnerToken(null, "run-1")).toBe(false);
  });

  it("rejects token for wrong run id", () => {
    const token = generateRunnerToken("run-1", 3600);
    expect(verifyRunnerToken(token, "run-2")).toBe(false);
  });

  it("accepts valid runner token", () => {
    const token = generateRunnerToken("run-1", 3600);
    expect(verifyRunnerToken(token, "run-1")).toBe(true);
  });
});

