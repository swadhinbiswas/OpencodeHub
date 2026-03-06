import type { UnifiedWorkflow } from "@/lib/ci-formats";
import { toGitHubActions, toGitLabCI } from "@/lib/ci-formats";
import { describe, expect, it } from "vitest";

const sampleWorkflow: UnifiedWorkflow = {
  name: "CI Pipeline",
  triggers: ["push", "pull_request"],
  env: { NODE_ENV: "test" },
  jobs: [
    {
      name: "build",
      runsOn: "ubuntu-latest",
      steps: [
        { name: "Checkout", uses: "actions/checkout@v4" },
        {
          name: "Setup Node",
          uses: "actions/setup-node@v4",
          with: { "node-version": "20" },
        },
        { name: "Install deps", run: "npm ci" },
        { name: "Build", run: "npm run build" },
      ],
    },
    {
      name: "test",
      runsOn: "ubuntu-latest",
      needs: ["build"],
      steps: [
        { name: "Checkout", uses: "actions/checkout@v4" },
        { name: "Run tests", run: "npm test" },
      ],
    },
  ],
};

describe("toGitHubActions", () => {
  it("generates valid YAML string", () => {
    const result = toGitHubActions(sampleWorkflow);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes workflow name", () => {
    const result = toGitHubActions(sampleWorkflow);
    expect(result).toContain("CI Pipeline");
  });

  it("includes job definitions", () => {
    const result = toGitHubActions(sampleWorkflow);
    expect(result).toContain("build");
    expect(result).toContain("test");
  });

  it("includes steps", () => {
    const result = toGitHubActions(sampleWorkflow);
    expect(result).toContain("npm ci");
    expect(result).toContain("npm run build");
    expect(result).toContain("npm test");
  });

  it("includes uses references", () => {
    const result = toGitHubActions(sampleWorkflow);
    expect(result).toContain("actions/checkout@v4");
    expect(result).toContain("actions/setup-node@v4");
  });

  it("handles minimal workflow", () => {
    const minimal: UnifiedWorkflow = {
      name: "Minimal",
      triggers: ["push"],
      jobs: [
        {
          name: "hello",
          steps: [{ name: "Say hello", run: 'echo "hello"' }],
        },
      ],
    };
    const result = toGitHubActions(minimal);
    expect(result).toContain("Minimal");
    expect(result).toContain("echo");
  });
});

describe("toGitLabCI", () => {
  it("generates valid YAML string", () => {
    const result = toGitLabCI(sampleWorkflow);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes stage/job definitions", () => {
    const result = toGitLabCI(sampleWorkflow);
    expect(result).toContain("build");
    expect(result).toContain("test");
  });

  it("includes script commands", () => {
    const result = toGitLabCI(sampleWorkflow);
    expect(result).toContain("npm ci");
    expect(result).toContain("npm run build");
    expect(result).toContain("npm test");
  });

  it("handles minimal workflow", () => {
    const minimal: UnifiedWorkflow = {
      name: "Minimal",
      triggers: ["push"],
      jobs: [
        {
          name: "hello",
          steps: [{ name: "Say hello", run: 'echo "hello"' }],
        },
      ],
    };
    const result = toGitLabCI(minimal);
    expect(result).toContain("echo");
  });
});
