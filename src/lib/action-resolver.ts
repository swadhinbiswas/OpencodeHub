/**
 * Action Resolver — server-side resolution of `uses:` steps for the
 * polling self-hosted runner.
 *
 * The polling runner only executes `run:` shell lines. This module converts
 * `uses:` steps into executable `run` scripts:
 *
 *   - composite actions (local `./path` or remote `owner/repo@ref`)
 *     -> shell lines from `runs.steps` with `INPUT_*` env exported
 *   - `actions/checkout@*` -> native git clone of the repository
 *   - node16/node20/docker actions -> fail-fast with a clear message
 *     (previously these steps hung forever in "queued" state)
 */
import { parse as parseYaml } from "yaml";
import fs from "node:fs/promises";
import path from "node:path";
import { execAsync } from "./exec";

export interface ResolveActionInput {
  uses: string;
  withInputs?: Record<string, string>;
  repositoryPath: string; // local path to the repo (for ./local actions)
  repositoryUrl?: string; // git URL for checkout
  ref?: string; // branch/commit for checkout
  cacheDir: string;
}

export interface ResolvedAction {
  run: string;
  kind: "composite" | "checkout" | "unsupported";
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function downloadRemoteAction(
  repoRef: string,
  ref: string,
  cacheDir: string,
): Promise<string> {
  const actionDir = path.join(cacheDir, "actions", repoRef, ref);
  let cacheValid = false;
  try {
    const stat = await fs.stat(path.join(actionDir, "action.yml"));
    cacheValid = Date.now() - stat.mtimeMs < CACHE_TTL_MS;
  } catch {
    try {
      const stat = await fs.stat(path.join(actionDir, "action.yaml"));
      cacheValid = Date.now() - stat.mtimeMs < CACHE_TTL_MS;
    } catch {
      cacheValid = false;
    }
  }
  if (cacheValid) return actionDir;

  await fs.rm(actionDir, { recursive: true, force: true });
  await fs.mkdir(actionDir, { recursive: true });
  const cloneUrl = `https://github.com/${repoRef}.git`;
  try {
    await execAsync(
      `git clone --depth 1 --branch ${ref} ${cloneUrl} ${actionDir}`,
      { timeout: 60_000 },
    );
  } catch {
    try {
      await fs.rm(actionDir, { recursive: true, force: true });
      await fs.mkdir(actionDir, { recursive: true });
      await execAsync(`git clone ${cloneUrl} ${actionDir}`, {
        timeout: 120_000,
      });
      await execAsync(`git -C ${actionDir} checkout ${ref}`, {
        timeout: 60_000,
      });
    } catch (err) {
      throw new Error(
        `Failed to download action ${repoRef}@${ref}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return actionDir;
}

async function readActionConfig(actionDir: string): Promise<any> {
  try {
    const yml = await fs.readFile(path.join(actionDir, "action.yml"), "utf8");
    return parseYaml(yml);
  } catch {
    const yml = await fs.readFile(path.join(actionDir, "action.yaml"), "utf8");
    return parseYaml(yml);
  }
}

export async function resolveActionStep(
  input: ResolveActionInput,
): Promise<ResolvedAction> {
  const uses = input.uses;

  // ── actions/checkout: native clone ────────────────────────────────────
  if (uses.startsWith("actions/checkout@")) {
    if (!input.repositoryUrl) {
      return {
        kind: "checkout",
        run:
          "echo '::error::actions/checkout requires the server to provide a repository URL (configure SITE_URL)' && exit 1",
      };
    }
    const branch = input.ref || "main";
    return {
      kind: "checkout",
      run: [
        "set -e",
        'echo "::group::Checking out repository"',
        `git clone --depth 1 --branch "${branch}" "${input.repositoryUrl}" . || git clone --depth 1 "${input.repositoryUrl}" .`,
        "echo '::endgroup::'",
      ].join("\n"),
    };
  }

  // ── Local action (./path) ─────────────────────────────────────────────
  let actionDir: string;
  let isLocal = false;
  if (uses.startsWith("./")) {
    isLocal = true;
    actionDir = path.join(input.repositoryPath, uses);
  } else {
    const [repoRef, version] = uses.split("@");
    const ref = version || "main";
    actionDir = await downloadRemoteAction(repoRef, ref, input.cacheDir);
  }

  let config: any;
  try {
    config = await readActionConfig(actionDir);
  } catch {
    return {
      kind: "unsupported",
      run: `echo '::error::Could not find action.yml for "${uses}"' && exit 1`,
    };
  }

  const using = config.runs?.using;
  const inputEnv = Object.entries(input.withInputs || {})
    .map(([key, value]) => {
      const envKey = `INPUT_${key.toUpperCase().replace(/-/g, "_")}`;
      const escaped = String(value).replace(/'/g, `'\\''`);
      return `export ${envKey}='${escaped}'`;
    })
    .join("\n");

  // ── Composite action: inline the steps as shell lines ─────────────────
  if (using === "composite") {
    const steps = (config.runs?.steps || []) as any[];
    if (steps.length === 0) {
      return {
        kind: "unsupported",
        run: `echo '::error::Composite action "${uses}" has no steps' && exit 1`,
      };
    }
    const lines: string[] = ["set -e", "cd \"$GITHUB_WORKSPACE\" 2>/dev/null || true"];
    if (inputEnv) lines.push(inputEnv);
    let stepNumber = 0;
    for (const step of steps) {
      stepNumber++;
      if (step.run) {
        const label = step.name || `Step ${stepNumber}`;
        lines.push(`echo "::group::${label}"`);
        lines.push(step.run.replace(/\r?\n/g, "\n"));
        lines.push("echo '::endgroup::'");
      } else if (step.uses) {
        lines.push(`echo "::warning::Nested action ${step.uses} inside composite actions is not yet supported by self-hosted runners"`);
      }
    }
    return { kind: "composite", run: lines.join("\n") };
  }

  // ── Node / Docker actions: fail fast with a clear message ─────────────
  const kindLabel = isLocal ? "local" : "remote";
  return {
    kind: "unsupported",
    run: [
      `echo "::error::Action ${uses} (${using || "unknown"} type, ${kindLabel}) is not yet supported by OpenCodeHub self-hosted runners. Use a composite action or a run step instead."`,
      "exit 1",
    ].join("\n"),
  };
}
