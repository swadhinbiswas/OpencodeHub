/**
 * PR Health Score Calculator
 * Computes an overall health score from multiple analysis signals.
 */

import type { ComplexityResult } from "./complexity-engine";
import type { BlastRadius } from "./blast-radius";
import type { ArchImpact } from "./arch-impact";

export interface HealthScore {
  score: number; // 0-100
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  factors: HealthFactor[];
  summary: string;
}

export interface HealthFactor {
  name: string;
  score: number; // 0-100, 100 = best
  weight: number;
  description: string;
}

function calculateGrade(score: number): HealthScore["grade"] {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

export function calculateHealthScore(
  complexity: ComplexityResult,
  blastRadius: BlastRadius,
  archImpact: ArchImpact,
  additions: number,
  deletions: number,
): HealthScore {
  const factors: HealthFactor[] = [];

  // 1. Complexity Score (weight: 25)
  const complexityScore = Math.max(0, 100 - complexity.riskScore);
  factors.push({
    name: "Code Complexity",
    score: complexityScore,
    weight: 25,
    description: complexity.cyclomaticComplexity <= 5
      ? "Low complexity"
      : complexity.cyclomaticComplexity <= 10
      ? "Moderate complexity"
      : complexity.cyclomaticComplexity <= 20
      ? "High complexity"
      : "Very high complexity",
  });

  // 2. Blast Radius Score (weight: 25)
  const blastScore = Math.max(0, 100 - blastRadius.riskScore);
  factors.push({
    name: "Blast Radius",
    score: blastScore,
    weight: 25,
    description: blastRadius.directChanges <= 5
      ? "Small, focused change"
      : blastRadius.directChanges <= 15
      ? "Moderate scope"
      : "Large, wide-reaching change",
  });

  // 3. Architecture Impact Score (weight: 20)
  let archScore = 100;
  if (archImpact.crossLayerChanges) archScore -= 30;
  if (archImpact.securityImpact) archScore -= 25;
  if (archImpact.databaseImpact) archScore -= 20;
  archScore = Math.max(0, archScore);
  factors.push({
    name: "Architecture Impact",
    score: archScore,
    weight: 20,
    description: archImpact.crossLayerChanges
      ? "Changes span multiple architectural layers"
      : "Changes are well-contained within a single layer",
  });

  // 4. Change Size Score (weight: 15)
  const totalChanges = additions + deletions;
  const sizeScore = Math.max(0, 100 - (totalChanges / 10));
  factors.push({
    name: "Change Size",
    score: Math.min(100, Math.max(0, sizeScore)),
    weight: 15,
    description: totalChanges <= 50
      ? "Small, reviewable change"
      : totalChanges <= 200
      ? "Medium-sized change"
      : "Large change — consider breaking into smaller PRs",
  });

  // 5. Long Functions Score (weight: 15)
  const longFuncPenalty = complexity.longFunctions.length * 15;
  const longFuncScore = Math.max(0, 100 - longFuncPenalty);
  factors.push({
    name: "Function Length",
    score: longFuncScore,
    weight: 15,
    description: complexity.longFunctions.length === 0
      ? "No oversized functions detected"
      : `${complexity.longFunctions.length} function(s) exceed recommended length`,
  });

  // Calculate weighted average
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const weightedScore = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;
  const score = Math.round(Math.max(0, Math.min(100, weightedScore)));

  // Build summary
  const grade = calculateGrade(score);
  const summaryParts: string[] = [];
  if (score >= 80) summaryParts.push("PR looks good");
  else if (score >= 60) summaryParts.push("PR has some concerns");
  else summaryParts.push("PR needs attention");

  if (complexity.longFunctions.length > 0) {
    summaryParts.push(`${complexity.longFunctions.length} long function(s)`);
  }
  if (archImpact.crossLayerChanges) {
    summaryParts.push("cross-layer changes");
  }
  if (blastRadius.riskScore >= 50) {
    summaryParts.push("wide blast radius");
  }

  return {
    score,
    grade,
    factors,
    summary: summaryParts.join(", ") + ".",
  };
}
