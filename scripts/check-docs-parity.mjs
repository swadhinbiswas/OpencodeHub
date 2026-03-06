import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const docsRoot = path.join(root, "docs");
const siteRoot = path.join(root, "docs-site", "src", "content", "docs");
const baselinePath = path.join(root, "doc", "docs-parity-baseline.json");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
      continue;
    }
    files.push(full);
  }
  return files;
}

function toRel(base, file) {
  return path.relative(base, file).replaceAll("\\", "/");
}

function stripExt(rel) {
  return rel.replace(/\.(md|mdx)$/i, "");
}

async function main() {
  const docsFiles = (await walk(docsRoot)).filter((f) => f.endsWith(".md"));
  const siteFiles = (await walk(siteRoot)).filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));

  const docsRel = docsFiles.map((f) => toRel(docsRoot, f));
  const siteRel = siteFiles.map((f) => toRel(siteRoot, f));

  const docsSet = new Set(docsRel.map(stripExt));
  const siteSet = new Set(siteRel.map(stripExt));

  const missingInSite = [...docsSet].filter((p) => !siteSet.has(p)).sort();
  const missingInDocs = [...siteSet].filter((p) => !docsSet.has(p)).sort();

  let baseline = { missingInSite: [], missingInDocs: [] };
  try {
    baseline = JSON.parse(await readFile(baselinePath, "utf-8"));
  } catch {
    // No baseline found; treat current state as strict parity requirement.
  }

  const baselineMissingInSite = new Set((baseline.missingInSite || []).map(String));
  const baselineMissingInDocs = new Set((baseline.missingInDocs || []).map(String));

  const newMissingInSite = missingInSite.filter((item) => !baselineMissingInSite.has(item));
  const newMissingInDocs = missingInDocs.filter((item) => !baselineMissingInDocs.has(item));

  if (newMissingInSite.length === 0 && newMissingInDocs.length === 0) {
    console.log("Docs parity check passed (no new parity drift beyond baseline).");
    return;
  }

  if (newMissingInSite.length > 0) {
    console.error("New files missing in docs-site/src/content/docs:");
    for (const file of newMissingInSite) {
      console.error(`  - ${file}`);
    }
  }

  if (newMissingInDocs.length > 0) {
    console.error("New files missing in docs/:");
    for (const file of newMissingInDocs) {
      console.error(`  - ${file}`);
    }
  }

  process.exit(1);
}

main().catch((error) => {
  console.error("Docs parity check failed:", error);
  process.exit(1);
});
