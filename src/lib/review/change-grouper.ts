/**
 * Change Grouper
 * Groups related file changes into semantic units for easier review.
 */

import type { DiffChunk } from "./diff-chunker";
import type { DependencyGraph } from "./dep-graph";
import type { ComplexityResult } from "./complexity-engine";
import { analyzeAllComplexity } from "./complexity-engine";

export interface ChangeGroup {
  id: string;
  title: string;
  description: string;
  files: string[];
  layer: string;
  complexity: ComplexityResult;
  riskLevel: "low" | "medium" | "high" | "critical";
  totalAdditions: number;
  totalDeletions: number;
}

// Feature detection patterns
const FEATURE_PATTERNS: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/(?:add|create|new|introduce)s?\s+(\w+)/i, (m) => `Add ${m[1]}`],
  [/(?:fix|patch|resolve|bug)s?\s+(\w+)/i, (m) => `Fix ${m[1]}`],
  [/(?:refactor|clean|reorganize)s?\s+(\w+)/i, (m) => `Refactor ${m[1]}`],
  [/(?:update|modify|change|improve)s?\s+(\w+)/i, (m) => `Update ${m[1]}`],
  [/(?:remove|delete|deprecate)s?\s+(\w+)/i, (m) => `Remove ${m[1]}`],
];

function guessFeatureName(files: string[]): string {
  // Try to extract feature name from file paths
  const allPaths = files.join("/");

  // Look for common patterns
  const featureMatch = allPaths.match(/(?:src\/lib\/|src\/components\/|src\/pages\/)([^/]+)/);
  if (featureMatch) {
    const name = featureMatch[1]
      .replace(/-/g, " ")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
    return name;
  }

  // Extract from file names
  const fileNames = files.map(f => f.split("/").pop()?.replace(/\.\w+$/, "") || "");
  const commonPrefix = findCommonPrefix(fileNames);
  if (commonPrefix.length > 2) {
    return commonPrefix
      .replace(/-/g, " ")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  return "Related Changes";
}

function findCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (const s of strings.slice(1)) {
    while (!s.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix === "") return "";
    }
  }
  return prefix;
}

function groupByDirectory(chunks: DiffChunk[]): Map<string, DiffChunk[]> {
  const groups = new Map<string, DiffChunk[]>();

  for (const chunk of chunks) {
    const parts = chunk.filePath.split("/");
    // Use the deepest meaningful directory (up to 3 levels deep)
    const dirParts = parts.slice(0, Math.min(parts.length - 1, 3));
    const dir = dirParts.join("/") || "root";

    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(chunk);
  }

  return groups;
}

function groupByDependency(chunks: DiffChunk[], graph: DependencyGraph): DiffChunk[][] {
  const fileSet = new Set(chunks.map(c => c.filePath));
  const chunkMap = new Map(chunks.map(c => [c.filePath, c]));
  const groups: DiffChunk[][] = [];
  const visited = new Set<string>();

  for (const chunk of chunks) {
    if (visited.has(chunk.filePath)) continue;

    const groupFiles = new Set<string>();
    const queue = [chunk.filePath];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      groupFiles.add(current);

      for (const edge of graph.edges) {
        if ((edge.from === current || edge.to === current) && fileSet.has(edge.from) && fileSet.has(edge.to)) {
          if (!visited.has(edge.from)) queue.push(edge.from);
          if (!visited.has(edge.to)) queue.push(edge.to);
        }
      }
    }

    const groupChunks = Array.from(groupFiles)
      .map(f => chunkMap.get(f))
      .filter((c): c is DiffChunk => c !== undefined);
    groups.push(groupChunks);
  }

  return groups;
}

export function groupChanges(
  chunks: DiffChunk[],
  graph: DependencyGraph,
): ChangeGroup[] {
  if (chunks.length === 0) return [];

  const complexities = analyzeAllComplexity(chunks);

  // For small PRs (<= 5 files), create a single group
  if (chunks.length <= 5) {
    const title = guessFeatureName(chunks.map(c => c.filePath));
    const complexity = complexities.aggregate;
    return [{
      id: "group-1",
      title,
      description: `Changes in ${chunks.length} file(s)`,
      files: chunks.map(c => c.filePath),
      layer: determinePrimaryLayer(chunks),
      complexity,
      riskLevel: complexity.riskLevel,
      totalAdditions: chunks.reduce((s, c) => s + c.additions, 0),
      totalDeletions: chunks.reduce((s, c) => s + c.deletions, 0),
    }];
  }

  // For larger PRs, group by dependency graph first, then by directory
  const depGroups = groupByDependency(chunks, graph);
  const dirGroups = groupByDirectory(chunks);

  // Use whichever grouping produces fewer, more meaningful groups
  const useDepGroups = depGroups.length <= dirGroups.size && depGroups.length > 1;
  const rawGroups = useDepGroups ? depGroups : Array.from(dirGroups.values());

  return rawGroups.map((groupChunks, index) => {
    const files = groupChunks.map(c => c.filePath);
    const title = guessFeatureName(files);
    const groupComplexities = groupChunks.map(c => complexities.perFile.get(c.filePath)!).filter(Boolean);

    const worstComplexity = groupComplexities.reduce(
      (worst, c) => c.riskScore > (worst?.riskScore || 0) ? c : worst,
      groupComplexities[0],
    );

    return {
      id: `group-${index + 1}`,
      title,
      description: `Changes in ${groupChunks.length} file(s)`,
      files,
      layer: determinePrimaryLayer(groupChunks),
      complexity: worstComplexity || complexities.aggregate,
      riskLevel: worstComplexity?.riskLevel || "low",
      totalAdditions: groupChunks.reduce((s, c) => s + c.additions, 0),
      totalDeletions: groupChunks.reduce((s, c) => s + c.deletions, 0),
    };
  });
}

function determinePrimaryLayer(chunks: DiffChunk[]): string {
  const layerCounts = new Map<string, number>();
  for (const chunk of chunks) {
    const path = chunk.filePath.toLowerCase();
    let layer = "backend";
    if (/component|page|layout|\.tsx|\.vue|\.astro/i.test(path)) layer = "frontend";
    else if (/schema|migrat|model|entity/i.test(path)) layer = "database";
    else if (/test|spec|__tests__/i.test(path)) layer = "testing";
    else if (/auth|security|permission|token/i.test(path)) layer = "security";
    else if (/docker|deploy|ci|cd|infra/i.test(path)) layer = "infrastructure";
    layerCounts.set(layer, (layerCounts.get(layer) || 0) + 1);
  }

  let maxCount = 0;
  let primaryLayer = "backend";
  for (const [layer, count] of layerCounts) {
    if (count > maxCount) {
      maxCount = count;
      primaryLayer = layer;
    }
  }
  return primaryLayer;
}
