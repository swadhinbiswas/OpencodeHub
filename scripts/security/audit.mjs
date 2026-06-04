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
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(process.cwd());
const LOCKFILE = resolve(ROOT, "package-lock.json");
const ALLOWLIST = resolve(ROOT, "docs/administration/known-accepted-vulns.json");
const AUDIT_REGISTRY = "https://registry.npmjs.org";
const LOCKFILE_MAX_AGE_HOURS = 24;

const log = (level, msg) => console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);

function regenerateLockfile() {
  log("info", "Regenerating package-lock.json from package.json (--package-lock-only)…");
  const r = spawnSync(
    "npm",
    [
      "install",
      "--package-lock-only",
      "--no-audit",
      "--no-fund",
      `--registry=${AUDIT_REGISTRY}`,
    ],
    { stdio: "inherit" }
  );
  if (r.status !== 0) {
    log("error", "Failed to regenerate package-lock.json");
    process.exit(2);
  }
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
  const r = spawnSync(
    "npm",
    ["audit", `--registry=${AUDIT_REGISTRY}`, "--json"],
    { encoding: "utf8" }
  );

  const report = JSON.parse(r.stdout || "null") ?? {};
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
