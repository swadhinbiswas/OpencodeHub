/**
 * Wiring Audit — dead code / unwired feature detection
 *
 * Scans the codebase for the "disconnected wiring" class of issues that
 * made feature-audit claims optimistic:
 *
 *   1. Exported lib functions that nothing imports (zero-caller APIs)
 *   2. Schema table columns that no code reads or writes (dead columns)
 *   3. UI components that no page imports (orphaned components)
 *   4. Schema tables that no module references (orphaned tables)
 *
 * Usage:
 *   bun scripts/wiring-audit.ts              # report only
 *   bun scripts/wiring-audit.ts --fail       # exit 1 if findings exceed allowlist
 *
 * Allowlist: `scripts/wiring-audit-allowlist.json` — entries are
 * intentionally de-scoped (documented rationale). New findings beyond the
 * allowlist fail CI, keeping the "connection" debt from regrowing.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const rootDir = join(import.meta.dirname, "..");
const SRC = join(rootDir, "src");
const FAIL_MODE = process.argv.includes("--fail");
const ALLOWLIST_PATH = join(import.meta.dirname, "wiring-audit-allowlist.json");

interface Finding {
  kind: string;
  name: string;
  location: string;
  detail: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const srcFiles = walk(SRC);
const pageFiles = walk(join(SRC, "pages"));

// Usage corpus: everything under src (incl. .astro pages) plus scripts/,
// which legitimately calls lib functions (worker loops, drills, etc.)
function walkAll(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkAll(full));
    } else if (/\.(ts|tsx|astro)$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}
const allSrcFiles = [
  ...walkAll(SRC),
  ...walkAll(join(rootDir, "scripts")).filter((f) => f.endsWith(".ts")),
];
const allSrc = allSrcFiles.map((f) => readFileSync(f, "utf8"));

// ── 1. Zero-caller exported lib functions ────────────────────────────────
function auditZeroCallers(): Finding[] {
  const findings: Finding[] = [];
  const libFiles = walk(join(SRC, "lib"));

  for (const file of libFiles) {
    const content = readFileSync(file, "utf8");
    if (file.endsWith(".test.ts")) continue;

    // exported functions / async functions / consts assigned arrow fns
    const exportRe =
      /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
    const exports: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = exportRe.exec(content)) !== null) {
      exports.push(m[1] || m[2]);
    }

    for (const name of exports) {
      if (name.startsWith("_")) continue;
      const pattern = new RegExp(`\\b${name}\\b`);
      let uses = 0;
      for (const [i, other] of allSrc.entries()) {
        if (allSrcFiles[i] === file) {
          // same file: count usages on lines other than the declaration
          const lines = other.split("\n");
          let lineUses = 0;
          for (const line of lines) {
            if (/^\s*export\s/.test(line) && pattern.test(line)) continue;
            if (pattern.test(line)) lineUses++;
          }
          uses += lineUses;
          continue;
        }
        if (pattern.test(other)) uses++;
      }
      if (uses === 0) {
        findings.push({
          kind: "zero-caller-lib-function",
          name,
          location: relative(rootDir, file),
          detail: "exported but never imported by any src file",
        });
      }
    }
  }
  return findings;
}

// ── 2. Schema columns with zero references ───────────────────────────────
// Extract the source text of a pgTable(...) block using brace counting,
// so columns are attributed to the table they actually belong to.
function extractTableBlock(content: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return content.slice(openIndex, i);
    }
  }
  return content.slice(openIndex);
}

function auditSchemaColumns(): Finding[] {
  const findings: Finding[] = [];
  const schemaDir = join(SRC, "db", "schema");
  if (!existsSync(schemaDir)) return findings;
  const schemaFiles = walk(schemaDir);
  const allSrc = srcFiles.map((f) => readFileSync(f, "utf8"));

  for (const file of schemaFiles) {
    const content = readFileSync(file, "utf8");
    const tableRe = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*pgTable\(/g;
    let tm: RegExpExecArray | null;
    while ((tm = tableRe.exec(content)) !== null) {
      const tableName = tm[1];
      const block = extractTableBlock(content, tm.index + tm[0].length - 1);
      // column definitions: name: pgType(...) — skip relation-style calls
      const colRe = /^\s{2}([A-Za-z_$][\w$]*):\s+(?!one\(|many\()([a-zA-Z]+)\(/gm;
      let cm: RegExpExecArray | null;
      while ((cm = colRe.exec(block)) !== null) {
        const colName = cm[1];
        if (["id", "createdAt", "updatedAt"].includes(colName)) continue;
        // A column is considered used if its name is accessed via any
        // object property anywhere (`schema.t.col`, `row.col`, `data.col`)
        const pattern = new RegExp(`\\.${colName}\\b`);
        let uses = 0;
        for (const [i, src] of allSrc.entries()) {
          if (srcFiles[i] === file) continue;
          if (pattern.test(src)) uses++;
        }
        if (uses === 0) {
          findings.push({
            kind: "unreferenced-schema-column",
            name: `${tableName}.${colName}`,
            location: relative(rootDir, file),
            detail: "column name never accessed as a property anywhere in src",
          });
        }
      }
    }
  }
  return findings;
}

// ── 3. Orphaned UI components ────────────────────────────────────────────
function auditOrphanedComponents(): Finding[] {
  const findings: Finding[] = [];
  const compDir = join(SRC, "components");
  if (!existsSync(compDir)) return findings;
  const compFiles = walk(compDir);
  const pageContent = pageFiles.map((f) => readFileSync(f, "utf8"));
  const other = srcFiles.filter((f) => f.startsWith(compDir)).map((f) => readFileSync(f, "utf8"));

  for (const file of compFiles) {
    const name = file.split("/").pop()!.replace(/\.tsx$/, "");
    const importName = name.replace(/[^A-Za-z0-9_$]/g, "");
    const pattern = new RegExp(`(?:from|import)\\s*['"][^'"]*${name}['"]|\\b${importName}\\b`);
    let uses = 0;
    for (const p of pageContent) if (pattern.test(p)) uses++;
    for (const o of other) if (pattern.test(o)) uses++;
    if (uses === 0) {
      findings.push({
        kind: "orphaned-component",
        name,
        location: relative(rootDir, file),
        detail: "component is not imported by any page or component",
      });
    }
  }
  return findings;
}

// ── 4. Orphaned schema tables ────────────────────────────────────────────
function auditOrphanedTables(): Finding[] {
  const findings: Finding[] = [];
  const schemaDir = join(SRC, "db", "schema");
  if (!existsSync(schemaDir)) return findings;
  const allSrc = srcFiles.map((f) => readFileSync(f, "utf8"));
  for (const file of walk(schemaDir)) {
    const content = readFileSync(file, "utf8");
    const tableRe = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*pgTable\(/g;
    let tm: RegExpExecArray | null;
    while ((tm = tableRe.exec(content)) !== null) {
      const tableName = tm[1];
      const pattern = new RegExp(`\\b${tableName}\\b`);
      let uses = 0;
      for (const src of allSrc) {
        if (src === content) continue;
        if (pattern.test(src)) uses++;
      }
      if (uses === 0) {
        findings.push({
          kind: "orphaned-schema-table",
          name: tableName,
          location: relative(rootDir, file),
          detail: "table is never referenced outside its schema file",
        });
      }
    }
  }
  return findings;
}

const allowlist: Finding[] = existsSync(ALLOWLIST_PATH)
  ? JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
  : [];

const isAllowed = (f: Finding) =>
  allowlist.some(
    (a) => a.kind === f.kind && a.name === f.name && a.location === f.location,
  );

const findings = [
  ...auditZeroCallers(),
  ...auditSchemaColumns(),
  ...auditOrphanedComponents(),
  ...auditOrphanedTables(),
];

const newFindings = findings.filter((f) => !isAllowed(f));

console.log("═".repeat(72));
console.log(" WIRING AUDIT — disconnected-feature scan");
console.log("═".repeat(72));
console.log(` total findings:      ${findings.length}`);
console.log(` allowlisted:         ${findings.length - newFindings.length}`);
console.log(` NEW findings:        ${newFindings.length}`);
console.log("");

const byKind = new Map<string, Finding[]>();
for (const f of newFindings) {
  byKind.set(f.kind, [...(byKind.get(f.kind) || []), f]);
}
for (const [kind, list] of byKind) {
  console.log(`\n── ${kind} (${list.length}) ─────────────────────────────`);
  for (const f of list.slice(0, 40)) {
    console.log(`  ${f.name}  [${f.location}]`);
  }
  if (list.length > 40) console.log(`  … and ${list.length - 40} more`);
}

const reportPath = join(rootDir, "test-results", "wiring-audit.json");
writeFileSync(reportPath, JSON.stringify({ date: new Date().toISOString(), findings: newFindings }, null, 2));
console.log(`\nFull report: ${relative(rootDir, reportPath)}`);

if (FAIL_MODE && newFindings.length > 0) {
  console.error(`\n❌ Wiring audit FAILED: ${newFindings.length} new disconnected-feature findings.`);
  console.error("   Fix them or add to scripts/wiring-audit-allowlist.json with rationale.");
  process.exit(1);
}
console.log("\n✅ Wiring audit clean (within allowlist)");
