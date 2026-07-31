/**
 * Review Analysis Pipeline
 * Orchestrates all analysis engines into a single pipeline.
 */

import { simpleGit } from "simple-git";
import { chunkDiff, getDiffStats, type DiffChunk } from "./diff-chunker";
import { buildDependencyGraph, type DependencyGraph } from "./dep-graph";
import { assessArchitectureImpact, type ArchImpact } from "./arch-impact";
import { analyzeAllComplexity, type ComplexityResult } from "./complexity-engine";
import { groupChanges, type ChangeGroup } from "./change-grouper";
import { calculateBlastRadius, type BlastRadius } from "./blast-radius";
import { calculateHealthScore, type HealthScore } from "./scoring";

export interface ReviewAnalysis {
  chunks: DiffChunk[];
  depGraph: DependencyGraph;
  archImpact: ArchImpact;
  complexity: {
    perFile: Map<string, ComplexityResult>;
    aggregate: ComplexityResult;
  };
  groups: ChangeGroup[];
  blastRadius: BlastRadius;
  healthScore: HealthScore;
  stats: ReturnType<typeof getDiffStats>;
}

export async function getDiff(repoPath: string, baseSha: string, headSha: string): Promise<string> {
  const git = simpleGit(repoPath);
  try {
    const diff = await git.diff([baseSha, headSha, "--no-color"]);
    return diff;
  } catch (err) {
    // Fallback: try to get diff between commits
    const diff = await git.diff(["--no-color", baseSha, headSha]);
    return diff;
  }
}

export async function runAnalysisPipeline(
  repoPath: string,
  baseSha: string,
  headSha: string,
): Promise<ReviewAnalysis> {
  // 1. Extract diff
  const rawDiff = await getDiff(repoPath, baseSha, headSha);

  // 2. Chunk diff
  const chunks = chunkDiff(rawDiff);

  // 3. Build dependency graph
  const depGraph = buildDependencyGraph(chunks, repoPath);

  // 4. Analyze complexity per chunk
  const complexity = analyzeAllComplexity(chunks);

  // 5. Assess architecture impact
  const archImpact = assessArchitectureImpact(chunks);

  // 6. Group changes
  const groups = groupChanges(chunks, depGraph);

  // 7. Calculate blast radius
  const blastRadius = calculateBlastRadius(chunks, depGraph, archImpact);

  // 8. Calculate health score
  const healthScore = calculateHealthScore(
    complexity.aggregate,
    blastRadius,
    archImpact,
    chunks.reduce((s, c) => s + c.additions, 0),
    chunks.reduce((s, c) => s + c.deletions, 0),
  );

  // 9. Get overall stats
  const stats = getDiffStats(chunks);

  return {
    chunks,
    depGraph,
    archImpact,
    complexity,
    groups,
    blastRadius,
    healthScore,
    stats,
  };
}
