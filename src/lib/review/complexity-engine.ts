/**
 * Complexity Analysis Engine
 * Measures cyclomatic complexity, nesting depth, and risk scores from diffs.
 */

import type { DiffChunk } from "./diff-chunker";

export interface ComplexityResult {
  cyclomaticComplexity: number;
  nestingDepth: number;
  functionCount: number;
  longFunctions: { name: string; lines: number }[];
  riskLevel: "low" | "medium" | "high" | "critical";
  riskScore: number;
  metrics: {
    conditionals: number;
    loops: number;
    tryCatch: number;
    switchCases: number;
    ternaryOperators: number;
  };
}

const CONDITIONAL_PATTERN = /\b(if|else if|elsif|elif|&&|\|\||\?\?|\?\.)\b/g;
const LOOP_PATTERN = /\b(for|while|do|forEach|map|filter|reduce|some|every)\b/g;
const TRY_CATCH_PATTERN = /\b(try|catch|except|rescue)\b/g;
const SWITCH_PATTERN = /\b(switch|case|match)\b/g;
const TERNARY_PATTERN = /\?[^?]/g;
const FUNCTION_PATTERN = /\b(function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\(|function)|(?:async\s+)?(?:\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{)/g;
const LONG_FUNCTION_THRESHOLD = 40;

function calculateCyclomaticComplexity(content: string): { complexity: number; metrics: ComplexityResult["metrics"] } {
  let complexity = 1; // Base complexity

  const conditionals = (content.match(CONDITIONAL_PATTERN) || []).length;
  const loops = (content.match(LOOP_PATTERN) || []).length;
  const tryCatch = (content.match(TRY_CATCH_PATTERN) || []).length;
  const switchCases = (content.match(SWITCH_PATTERN) || []).length;
  const ternaryOperators = (content.match(TERNARY_PATTERN) || []).length;

  complexity += conditionals + loops + tryCatch + switchCases + ternaryOperators;

  return {
    complexity,
    metrics: { conditionals, loops, tryCatch, switchCases, ternaryOperators },
  };
}

function calculateNestingDepth(content: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of content) {
    if (char === '{' || char === '(') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === '}' || char === ')') {
      currentDepth = Math.max(0, currentDepth - 1);
    }
  }
  return maxDepth;
}

function findLongFunctions(content: string): { name: string; lines: number }[] {
  const functions: { name: string; lines: number }[] = [];
  const lines = content.split('\n');

  let inFunction = false;
  let functionName = '';
  let functionStart = 0;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const funcMatch = line.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|function)|(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{)/);
    if (funcMatch && !inFunction) {
      inFunction = true;
      functionName = funcMatch[1] || funcMatch[2] || funcMatch[3] || 'anonymous';
      functionStart = i;
      braceDepth = 0;
    }

    if (inFunction) {
      for (const char of line) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
      }

      if (braceDepth <= 0 && i > functionStart) {
        const lineCount = i - functionStart;
        if (lineCount >= LONG_FUNCTION_THRESHOLD) {
          functions.push({ name: functionName, lines: lineCount });
        }
        inFunction = false;
      }
    }
  }

  return functions;
}

function calculateRiskScore(result: ComplexityResult, additions: number, deletions: number): number {
  let score = 0;

  // Cyclomatic complexity contribution (0-30 points)
  score += Math.min(result.cyclomaticComplexity * 2, 30);

  // Nesting depth contribution (0-20 points)
  score += Math.min(result.nestingDepth * 4, 20);

  // Change size contribution (0-25 points)
  const totalChanges = additions + deletions;
  score += Math.min(totalChanges / 10, 25);

  // Long functions penalty (0-15 points)
  score += Math.min(result.longFunctions.length * 5, 15);

  // Switch/case density (0-10 points)
  score += Math.min(result.metrics.switchCases * 2, 10);

  return Math.min(Math.round(score), 100);
}

function determineRiskLevel(score: number): ComplexityResult["riskLevel"] {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function analyzeComplexity(chunk: DiffChunk): ComplexityResult {
  const fullContent = chunk.hunks.map(h => h.content).join("\n");
  const addedContent = chunk.hunks
    .flatMap(h => h.content.split("\n"))
    .filter(l => l.startsWith("+") && !l.startsWith("+++"))
    .map(l => l.slice(1))
    .join("\n");

  // Analyze added/changed code primarily
  const analysisContent = addedContent || fullContent;

  const { complexity, metrics } = calculateCyclomaticComplexity(analysisContent);
  const nestingDepth = calculateNestingDepth(fullContent);
  const longFunctions = findLongFunctions(fullContent);
  const functionCount = (fullContent.match(FUNCTION_PATTERN) || []).length;

  const result: ComplexityResult = {
    cyclomaticComplexity: complexity,
    nestingDepth,
    functionCount,
    longFunctions,
    riskLevel: "low",
    riskScore: 0,
    metrics,
  };

  result.riskScore = calculateRiskScore(result, chunk.additions, chunk.deletions);
  result.riskLevel = determineRiskLevel(result.riskScore);

  return result;
}

export function analyzeAllComplexity(chunks: DiffChunk[]): {
  perFile: Map<string, ComplexityResult>;
  aggregate: ComplexityResult;
} {
  const perFile = new Map<string, ComplexityResult>();

  for (const chunk of chunks) {
    perFile.set(chunk.filePath, analyzeComplexity(chunk));
  }

  // Aggregate: worst-case scores
  const allResults = Array.from(perFile.values());
  const aggregate: ComplexityResult = {
    cyclomaticComplexity: Math.max(...allResults.map(r => r.cyclomaticComplexity), 1),
    nestingDepth: Math.max(...allResults.map(r => r.nestingDepth), 0),
    functionCount: allResults.reduce((s, r) => s + r.functionCount, 0),
    longFunctions: allResults.flatMap(r => r.longFunctions),
    riskScore: Math.round(allResults.reduce((s, r) => s + r.riskScore, 0) / (allResults.length || 1)),
    riskLevel: "low",
    metrics: {
      conditionals: allResults.reduce((s, r) => s + r.metrics.conditionals, 0),
      loops: allResults.reduce((s, r) => s + r.metrics.loops, 0),
      tryCatch: allResults.reduce((s, r) => s + r.metrics.tryCatch, 0),
      switchCases: allResults.reduce((s, r) => s + r.metrics.switchCases, 0),
      ternaryOperators: allResults.reduce((s, r) => s + r.metrics.ternaryOperators, 0),
    },
  };
  aggregate.riskLevel = determineRiskLevel(aggregate.riskScore);

  return { perFile, aggregate };
}
