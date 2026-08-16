/**
 * OpenAPI Coverage Audit (WS5-01)
 *
 * Measures how much of the REST surface (src/pages/api/**) is documented
 * in the OpenAPI spec (src/lib/openapi.ts).
 *
 * Route-file → spec-path mapping follows the existing parity-test
 * convention: `[param]` → `{param}`, `index` → parent path.
 *
 * Usage:
 *   bun scripts/openapi-coverage.ts          # report
 *   bun scripts/openapi-coverage.ts --fail   # exit 1 below threshold
 *
 * Env:
 *   OPENAPI_COVERAGE_THRESHOLD — minimum path coverage % (default 60)
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { openApiSpec } from "@/lib/openapi";

const rootDir = join(import.meta.dirname, "..");
const API_ROOT = join(rootDir, "src", "pages", "api");
const FAIL_MODE = process.argv.includes("--fail");
const THRESHOLD = parseInt(process.env.OPENAPI_COVERAGE_THRESHOLD || "60", 10);

function collectRouteFiles(dir: string): string[] {
  const files: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        stack.push(full);
      } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
        files.push(full);
      }
    }
  }
  return files;
}

function routeToSpecPath(routeFile: string): string {
  const relativePath = relative(API_ROOT, routeFile).replace(/\.ts$/, "");
  const segments = relativePath.split("/");
  // Find the param markers and rebuild the URL-style path
  let path = "/" + segments.map((s) => s.replace(/\[([^\]]+)\]/g, "{$1}")).join("/");
  // index files map to the parent directory path
  if (path.endsWith("/index")) path = path.slice(0, -"/index".length);
  if (path === "") path = "/";
  return path;
}

const routeFiles = collectRouteFiles(API_ROOT);
const specPaths = new Set(Object.keys(openApiSpec.paths ?? {}));

// Also canonicalize spec paths ({owner} → {}) for loose matching
const specPathVariants = new Set<string>();
for (const p of specPaths) {
  specPathVariants.add(p);
  specPathVariants.add(p.replace(/\{[^}]+\}/g, "{}"));
}

const covered: string[] = [];
const missing: Array<{ file: string; path: string }> = [];

for (const file of routeFiles) {
  const path = routeToSpecPath(file);
  const canonical = path.replace(/\{[^}]+\}/g, "{}");
  const isCovered =
    specPaths.has(path) || specPathVariants.has(canonical);
  if (isCovered) covered.push(file);
  else missing.push({ file: relative(API_ROOT, file), path });
}

const pct = Math.round((covered.length / routeFiles.length) * 1000) / 10;

console.log("═".repeat(72));
console.log(" OPENAPI COVERAGE AUDIT");
console.log("═".repeat(72));
console.log(` route files:      ${routeFiles.length}`);
console.log(` documented:       ${covered.length} (${pct}%)`);
console.log(` undocumented:     ${missing.length}`);
console.log(` spec paths total: ${specPaths.size}`);
console.log(` threshold:        ${THRESHOLD}%`);

if (missing.length > 0) {
  console.log("\n── Undocumented routes ────────────────────────────");
  const byArea = new Map<string, string[]>();
  for (const m of missing) {
    const area = m.path.split("/")[2] || "root";
    byArea.set(area, [...(byArea.get(area) || []), m.path]);
  }
  for (const [area, paths] of byArea) {
    console.log(`\n  ${area}/ (${paths.length})`);
    for (const p of paths.slice(0, 12)) console.log(`    ${p}`);
    if (paths.length > 12) console.log(`    … and ${paths.length - 12} more`);
  }
}

const reportPath = join(rootDir, "test-results", "openapi-coverage.json");
const { writeFileSync } = await import("node:fs");
writeFileSync(
  reportPath,
  JSON.stringify({ date: new Date().toISOString(), pct, covered: covered.length, total: routeFiles.length, missing: missing.map((m) => m.path) }, null, 2),
);
console.log(`\nReport: ${relative(rootDir, reportPath)}`);

if (FAIL_MODE && pct < THRESHOLD) {
  console.error(`\n❌ OpenAPI coverage ${pct}% is below the ${THRESHOLD}% threshold.`);
  console.error("   Document missing routes in src/lib/openapi.ts.");
  process.exit(1);
}
console.log(`\n✅ OpenAPI coverage ${pct}% (threshold ${THRESHOLD}%)`);
