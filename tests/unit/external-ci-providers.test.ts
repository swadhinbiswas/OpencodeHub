import { describe, expect, it } from "vitest";
import { CI_PROVIDERS } from "@/lib/external-ci";

describe("external CI provider matrix", () => {
  it("includes all hardening-target providers", () => {
    expect(CI_PROVIDERS.jenkins).toBeDefined();
    expect(CI_PROVIDERS.circleci).toBeDefined();
    expect(CI_PROVIDERS.buildkite).toBeDefined();
    expect(CI_PROVIDERS.gitlab).toBeDefined();
  });

  it("defines trigger and status endpoints for core providers", () => {
    for (const provider of ["jenkins", "circleci", "buildkite", "gitlab"] as const) {
      expect(CI_PROVIDERS[provider].triggerEndpoint.length).toBeGreaterThan(0);
      expect(CI_PROVIDERS[provider].statusEndpoint.length).toBeGreaterThan(0);
    }
  });
});
