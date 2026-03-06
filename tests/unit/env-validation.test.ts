import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("env-validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates environment without crashing", async () => {
    const { validateEnvironment } = await import("@/lib/env-validation");
    // Pass false to avoid process.exit on error
    const result = validateEnvironment(false);
    expect(typeof result).toBe("boolean");
  });

  it("returns boolean result", async () => {
    const { validateEnvironment } = await import("@/lib/env-validation");
    const result = validateEnvironment(false);
    expect(typeof result).toBe("boolean");
  });
});
