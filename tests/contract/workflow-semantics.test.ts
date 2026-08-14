/**
 * Contract: CI workflow trigger semantics (GitHub Actions compatibility)
 *
 * Guards `PipelineRunner.shouldTrigger` in `src/lib/pipeline.ts`.
 * These semantics are what users' `.github/workflows/*.yml` files depend on.
 */
import { describe, expect, it } from "vitest";
import { PipelineRunner } from "@/lib/pipeline";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function parseWorkflow(yaml: string) {
  const dir = mkdtempSync(join(tmpdir(), "och-workflow-contract-"));
  const file = join(dir, "workflow.yml");
  writeFileSync(file, yaml);
  return new PipelineRunner({ workDir: dir }).parseWorkflow(file);
}

describe("workflow trigger contract", () => {
  it("triggers push on matching branch", async () => {
    const wf = await parseWorkflow(`
on:
  push:
    branches: [main, "release/*"]
jobs:
  test:
    runs-on: opencodehub
    steps:
      - run: echo ok
`);
    const runner = new PipelineRunner({ workDir: "/tmp" });
    expect(
      runner.shouldTrigger(wf, "push", { ref: "refs/heads/main" }),
    ).toBe(true);
    expect(
      runner.shouldTrigger(wf, "push", { ref: "refs/heads/release/1.0" }),
    ).toBe(true);
    expect(
      runner.shouldTrigger(wf, "push", { ref: "refs/heads/dev" }),
    ).toBe(false);
  });

  it("respects branches-ignore", async () => {
    const wf = await parseWorkflow(`
on:
  push:
    branches-ignore: [dev, "*.tmp"]
jobs:
  test:
    runs-on: opencodehub
    steps:
      - run: echo ok
`);
    const runner = new PipelineRunner({ workDir: "/tmp" });
    expect(
      runner.shouldTrigger(wf, "push", { ref: "refs/heads/main" }),
    ).toBe(true);
    expect(
      runner.shouldTrigger(wf, "push", { ref: "refs/heads/dev" }),
    ).toBe(false);
    expect(
      runner.shouldTrigger(wf, "push", { ref: "refs/heads/foo.tmp" }),
    ).toBe(false);
  });

  it("triggers push on tag refs when tags filter present", async () => {
    const wf = await parseWorkflow(`
on:
  push:
    tags: ["v*"]
jobs:
  test:
    runs-on: opencodehub
    steps:
      - run: echo ok
`);
    const runner = new PipelineRunner({ workDir: "/tmp" });
    expect(runner.shouldTrigger(wf, "push", { ref: "refs/tags/v1.0.0" })).toBe(
      true,
    );
    expect(
      runner.shouldTrigger(wf, "push", { ref: "refs/heads/v1.0.0" }),
    ).toBe(false);
  });

  it("applies path filters to changed files", async () => {
    const wf = await parseWorkflow(`
on:
  push:
    paths: ["src/**", "!src/test/**"]
jobs:
  test:
    runs-on: opencodehub
    steps:
      - run: echo ok
`);
    const runner = new PipelineRunner({ workDir: "/tmp" });
    expect(
      runner.shouldTrigger(wf, "push", {
        ref: "refs/heads/main",
        paths: ["src/lib/a.ts"],
      }),
    ).toBe(true);
    expect(
      runner.shouldTrigger(wf, "push", {
        ref: "refs/heads/main",
        paths: ["README.md"],
      }),
    ).toBe(false);
  });

  it("triggers pull_request only for listed activity types", async () => {
    const wf = await parseWorkflow(`
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  test:
    runs-on: opencodehub
    steps:
      - run: echo ok
`);
    const runner = new PipelineRunner({ workDir: "/tmp" });
    expect(
      runner.shouldTrigger(wf, "pull_request", { action: "opened" }),
    ).toBe(true);
    expect(
      runner.shouldTrigger(wf, "pull_request", { action: "closed" }),
    ).toBe(false);
  });

  it("pull_request without types triggers on any action", async () => {
    const wf = await parseWorkflow(`
on:
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: opencodehub
    steps:
      - run: echo ok
`);
    const runner = new PipelineRunner({ workDir: "/tmp" });
    expect(
      runner.shouldTrigger(wf, "pull_request", {
        action: "reopened",
        ref: "refs/heads/main",
      }),
    ).toBe(true);
    expect(
      runner.shouldTrigger(wf, "pull_request", {
        action: "opened",
        ref: "refs/heads/dev",
      }),
    ).toBe(false);
  });

  it("workflow_dispatch always triggers", async () => {
    const wf = await parseWorkflow(`
on: workflow_dispatch
jobs:
  test:
    runs-on: opencodehub
    steps:
      - run: echo ok
`);
    const runner = new PipelineRunner({ workDir: "/tmp" });
    expect(runner.shouldTrigger(wf, "workflow_dispatch", {})).toBe(true);
  });

  it("schedule trigger is recognized by the scheduler contract", async () => {
    const wf = await parseWorkflow(`
on:
  schedule:
    - cron: "0 2 * * *"
jobs:
  test:
    runs-on: opencodehub
    steps:
      - run: echo ok
`);
    const runner = new PipelineRunner({ workDir: "/tmp" });
    expect(runner.shouldTrigger(wf, "schedule", {})).toBe(true);
    expect(runner.shouldTrigger(wf, "push", { ref: "refs/heads/main" })).toBe(
      false,
    );
  });

  it("glob matching treats ** and * per GitHub semantics", async () => {
    const wf = await parseWorkflow(`
on:
  push:
    branches: ["feature/**"]
jobs:
  test:
    runs-on: opencodehub
    steps:
      - run: echo ok
`);
    const runner = new PipelineRunner({ workDir: "/tmp" });
    expect(
      runner.shouldTrigger(wf, "push", { ref: "refs/heads/feature/x" }),
    ).toBe(true);
    expect(
      runner.shouldTrigger(wf, "push", { ref: "refs/heads/feature/a/b" }),
    ).toBe(true);
    expect(
      runner.shouldTrigger(wf, "push", { ref: "refs/heads/features/x" }),
    ).toBe(false);
  });
});
