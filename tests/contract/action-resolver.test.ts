/**
 * Contract: action resolver (`uses:` → `run:` conversion)
 *
 * Guards `src/lib/action-resolver.ts` — the server-side resolution that
 * lets the polling self-hosted runner execute action steps.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveActionStep } from "@/lib/action-resolver";

function makeLocalAction(dir: string, actionYaml: string): string {
  mkdirSync(join(dir, "my-action"), { recursive: true });
  writeFileSync(join(dir, "my-action", "action.yml"), actionYaml);
  return join(dir, "my-action");
}

describe("action resolver contract", () => {
  it("resolves actions/checkout to a git clone script", async () => {
    const result = await resolveActionStep({
      uses: "actions/checkout@v4",
      repositoryPath: "/tmp",
      repositoryUrl: "http://localhost:4321/owner/repo.git",
      ref: "main",
      cacheDir: "/tmp/och-cache",
    });
    expect(result.kind).toBe("checkout");
    expect(result.run).toContain("git clone");
    expect(result.run).toContain("http://localhost:4321/owner/repo.git");
  });

  it("fails fast for checkout when no repository URL is available", async () => {
    const result = await resolveActionStep({
      uses: "actions/checkout@v4",
      repositoryPath: "/tmp",
      cacheDir: "/tmp/och-cache",
    });
    expect(result.kind).toBe("checkout");
    expect(result.run).toContain("::error::");
    expect(result.run).toContain("exit 1");
  });

  it("resolves local composite actions to run lines with INPUT_ env", async () => {
    const dir = mkdtempSync(join(tmpdir(), "och-action-"));
    const actionDir = makeLocalAction(
      dir,
      `name: Hello
description: Test
runs:
  using: composite
  steps:
    - name: Say hello
      run: echo "hello \${ inputs.who }"
    - name: Bye
      run: echo bye
`,
    );
    const result = await resolveActionStep({
      uses: "./my-action",
      repositoryPath: dir,
      withInputs: { who: "world" },
      cacheDir: "/tmp/och-cache",
    });
    expect(result.kind).toBe("composite");
    expect(result.run).toContain("export INPUT_WHO='world'");
    expect(result.run).toContain("echo \"hello ${ inputs.who }\"");
    expect(result.run).toContain("echo bye");
    expect(actionDir).toContain("my-action");
  });

  it("fails fast with a clear message for node actions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "och-action-node-"));
    makeLocalAction(
      dir,
      `name: Node
description: Test
runs:
  using: node20
  main: index.js
`,
    );
    const result = await resolveActionStep({
      uses: "./my-action",
      repositoryPath: dir,
      cacheDir: "/tmp/och-cache",
    });
    expect(result.kind).toBe("unsupported");
    expect(result.run).toContain("::error::");
    expect(result.run).toContain("node20");
    expect(result.run).toContain("exit 1");
  });

  it("produces deterministic output for the same input", async () => {
    const dir = mkdtempSync(join(tmpdir(), "och-action-det-"));
    makeLocalAction(
      dir,
      `name: Hello
description: Test
runs:
  using: composite
  steps:
    - run: echo hi
`,
    );
    const a = await resolveActionStep({
      uses: "./my-action",
      repositoryPath: dir,
      cacheDir: "/tmp/och-cache",
    });
    const b = await resolveActionStep({
      uses: "./my-action",
      repositoryPath: dir,
      cacheDir: "/tmp/och-cache",
    });
    expect(a.run).toBe(b.run);
  });
});

describe("docker action resolution", () => {
  it("resolves uses: docker://image to a docker run script", async () => {
    const result = await resolveActionStep({
      uses: "docker://alpine:3.18",
      withInputs: { who: "world" },
      repositoryPath: "/tmp",
      cacheDir: "/tmp/och-cache",
    });
    expect(result.kind).toBe("docker");
    expect(result.run).toContain("docker pull \"alpine:3.18\"");
    expect(result.run).toContain("docker run --rm");
    expect(result.run).toContain("export INPUT_WHO='world'");
  });

  it("resolves local docker-type actions with image + args", async () => {
    const dir = mkdtempSync(join(tmpdir(), "och-docker-action-"));
    makeLocalAction(
      dir,
      `name: Docker
description: Test
runs:
  using: docker
  image: busybox:1.36
  args: [sh, -c, "echo hi"]
`,
    );
    const result = await resolveActionStep({
      uses: "./my-action",
      repositoryPath: dir,
      cacheDir: "/tmp/och-cache",
    });
    expect(result.kind).toBe("docker");
    expect(result.run).toContain("docker pull \"busybox:1.36\"");
    expect(result.run).toContain('"sh"');
  });

  it("still fail-fasts for node actions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "och-node-action-"));
    makeLocalAction(
      dir,
      `name: Node
description: Test
runs:
  using: node20
  main: index.js
`,
    );
    const result = await resolveActionStep({
      uses: "./my-action",
      repositoryPath: dir,
      cacheDir: "/tmp/och-cache",
    });
    expect(result.kind).toBe("unsupported");
    expect(result.run).toContain("::error::");
  });
});
