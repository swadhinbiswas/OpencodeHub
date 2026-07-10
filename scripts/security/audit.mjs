#!/usr/bin/env node
/**
 * Dependency vulnerability audit.
 *
 * - Regenerates a `package-lock.json` (sibling to `bun.lock`) so that
 *   `npm audit` can use it. The file is git-ignored; CI regenerates it.
 * - Runs `npm audit --audit-level=high` and surfaces a non-zero exit
 *   code if any unallowed high/critical advisories remain.
 * - Supports a `KNOWN_ACCEPTED` allowlist for vulnerabilities that
 *   require breaking version migrations and are tracked in
 *   `docs/administration/security.md` with documented mitigations.
 *
 * Exit codes:
 *   0 — pass (no disallowed high/critical; moderate/known-accepted tolerated)
 *   1 — fail (disallowed high/critical vulnerability present)
 *   2 — script error
 */
import { existsSync, readFileSync, statSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = resolve(process.cwd());
const LOCKFILE = resolve(ROOT, "package-lock.json");
const ALLOWLIST = resolve(ROOT, "docs/administration/known-accepted-vulns.json");
const AUDIT_REGISTRY = "https://registry.npmjs.org";
const LOCKFILE_MAX_AGE_HOURS = 24;

const log = (level, msg) => console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);

function regenerateLockfile() {
  log("info", "Regenerating package-lock.json from package.json (--package-lock-only)…");
  // Some npm versions crash with `Cannot read properties of null (reading 'matches')`
  // when the existing node_modules is bun-hoisted (paths contain `+`) or when
  // hoisted packages reference the yarn/bun `workspace:` protocol in nested
  // `node_modules/<pkg>/package.json` (e.g. crossws in docs-site/node_modules).
  // We try three strategies in order:
  //   1. Plain `npm install --package-lock-only` in the project root.
  //   2. Same with `--ignore-scripts --legacy-peer-deps` to skip workspaces.
  //   3. Run `npm install --package-lock-only` from a clean temp directory
  //      containing only package.json, so npm never sees bun's hoisted
  //      `node_modules/.bun/*` paths or the docs-site nested packages.
  // If all three fail AND no lockfile exists on disk, exit 2; otherwise fall
  // back to auditing the existing lockfile (may be stale but better than 0).
  const root = ROOT;
  const attempts = [
    {
      label: "root (default)",
      run: () => spawnSync("npm", ["install", "--package-lock-only", "--no-audit", "--no-fund", `--registry=${AUDIT_REGISTRY}`], { cwd: root, stdio: "inherit" }),
    },
    {
      label: "root (--ignore-scripts --legacy-peer-deps)",
      run: () => spawnSync("npm", ["install", "--package-lock-only", "--no-audit", "--no-fund", "--ignore-scripts", "--legacy-peer-deps", `--registry=${AUDIT_REGISTRY}`], { cwd: root, stdio: "inherit" }),
    },
    {
      label: "clean temp directory (no hoisted node_modules)",
      run: () => {
        const tmp = mkdtempSync(join(tmpdir(), "och-audit-"));
        copyFileSync(join(root, "package.json"), join(tmp, "package.json"));
        try {
          return spawnSync("npm", ["install", "--package-lock-only", "--no-audit", "--no-fund", "--ignore-scripts", "--legacy-peer-deps", `--registry=${AUDIT_REGISTRY}`], { cwd: tmp, stdio: "inherit" });
        } finally {
          try {
            const generated = join(tmp, "package-lock.json");
            if (existsSync(generated)) copyFileSync(generated, LOCKFILE);
          } catch { /* best-effort */ }
          rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
  ];
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    log("info", `Lockfile regen attempt ${i + 1}: ${a.label}`);
    const r = a.run();
    if (r.status === 0) {
      // The clean-tmp attempt copies the lockfile before returning, so a
      // subsequent `existsSync(LOCKFILE)` check at the caller will pass.
      return;
    }
    log("warn", `Lockfile regen attempt ${i + 1} failed (exit ${r.status})`);
  }
  if (existsSync(LOCKFILE)) {
    log("warn", "Falling back to existing package-lock.json (may be stale)");
    return;
  }
  log("error", "Failed to regenerate package-lock.json and no fallback exists");
  process.exit(2);
}

function lockfileIsFresh() {
  if (!existsSync(LOCKFILE)) return false;
  const ageHours = (Date.now() - statSync(LOCKFILE).mtimeMs) / 3_600_000;
  return ageHours < LOCKFILE_MAX_AGE_HOURS;
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST)) return new Set();
  try {
    const data = JSON.parse(readFileSync(ALLOWLIST, "utf8"));
    return new Set(data.accepted ?? []);
  } catch (e) {
    log("error", `Could not parse ${ALLOWLIST}: ${e.message}`);
    return new Set();
  }
}

function runAudit() {
  log("info", `Running npm audit (registry=${AUDIT_REGISTRY})…`);
  if (!existsSync(LOCKFILE)) {
    log("error", "No package-lock.json to audit against");
    process.exit(2);
  }
  const r = spawnSync(
    "npm",
    ["audit", `--registry=${AUDIT_REGISTRY}`, "--json"],
    { encoding: "utf8" }
  );

  // npm may exit non-zero when vulnerabilities are found AND when the lockfile
  // is malformed. We rely on the JSON report regardless of exit code.
  let report = {};
  try {
    report = JSON.parse(r.stdout || "{}");
  } catch (e) {
    log("error", `Could not parse npm audit output: ${e.message}`);
    if (r.stderr) console.error(r.stderr);
    process.exit(2);
  }
  const meta = report.metadata?.vulnerabilities ?? {};
  const summary = {
    critical: meta.critical ?? 0,
    high: meta.high ?? 0,
    moderate: meta.moderate ?? 0,
    low: meta.low ?? 0,
    info: meta.info ?? 0,
  };
  log(
    "info",
    `Vulnerabilities: critical=${summary.critical} high=${summary.high} moderate=${summary.moderate} low=${summary.low} info=${summary.info}`,
  );

  const allow = loadAllowlist();
  const blockers = [];
  const accepted = [];
  for (const [name, info] of Object.entries(report.vulnerabilities ?? {})) {
    if (info.severity !== "high" && info.severity !== "critical") continue;
    if (allow.has(name)) {
      accepted.push(name);
      continue;
    }
    const fix = info.fixAvailable;
    const fixStr = fix
      ? typeof fix === "object"
        ? `${fix.name}@${fix.version} (breaking=${fix.isSemVerMajor})`
        : "non-breaking patch available"
      : "NO FIX AVAILABLE";
    blockers.push(`  - ${name} (${info.severity}) :: fix: ${fixStr}`);
  }

  if (accepted.length) {
    log(
      "info",
      `Known-accepted (tracked in ${ALLOWLIST}): ${accepted.join(", ")}`,
    );
  }

  if (blockers.length) {
    log("error", `Audit FAILED — ${blockers.length} disallowed high/critical:`);
    for (const line of blockers) console.error(line);
    process.exit(1);
  }

  log("info", "Audit PASSED — no disallowed high/critical vulnerabilities");
}

function main() {
  if (!lockfileIsFresh()) regenerateLockfile();
  else log("info", "Reusing existing package-lock.json (fresh)");
  runAudit();
}

main();
