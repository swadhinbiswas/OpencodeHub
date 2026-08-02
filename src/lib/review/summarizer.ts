/**
 * Multi-Level Summary Generator
 * Generates file, group, and PR-level summaries using analysis + LLM.
 */

import type { ReviewAnalysis } from "./pipeline";
import type { AIConfig } from "../ai-config";
import { getAIAdapter } from "../ai";
import { buildSummaryPrompt } from "./prompts";
import type { AIConfig as AdapterAIConfig } from "../ai/types";

export interface PRSummaries {
  overall: {
    title: string;
    summary: string;
    healthScore: number;
    riskLevel: string;
    keyChanges: string[];
    testing建议: string[];
  };
  groups: {
    groupId: string;
    title: string;
    summary: string;
    files: string[];
    risk: string;
  }[];
  metadata: {
    totalAdditions: number;
    totalDeletions: number;
    filesChanged: number;
    languages: string[];
    estimatedReviewTime: string;
  };
  riskAssessment: {
    level: string;
    reasons: string[];
  };
}

export interface ReviewPromptOptions {
  prTitle: string;
  prBody: string;
  repoName: string;
  owner: string;
  branch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

function estimateReviewTime(additions: number, deletions: number): string {
  // Rough estimate: ~200 lines per minute for experienced reviewer
  const totalLines = additions + deletions;
  const minutes = Math.max(1, Math.ceil(totalLines / 200));
  if (minutes < 5) return "~2 min";
  if (minutes < 15) return `~${minutes} min`;
  if (minutes < 60) return `~${Math.round(minutes / 5) * 5} min`;
  return `~${Math.round(minutes / 60 * 10) / 10} hr`;
}

export function generateFallbackSummaries(
  analysis: ReviewAnalysis,
  options: ReviewPromptOptions,
): PRSummaries {
  return {
    overall: {
      title: options.prTitle,
      summary: `PR changes ${options.filesChanged} file(s) with +${options.additions}/-${options.deletions} lines across ${analysis.archImpact.affectedLayers.length} layer(s).`,
      healthScore: analysis.healthScore.score,
      riskLevel: analysis.blastRadius.riskLevel,
      keyChanges: analysis.groups.map(g => g.title),
      testing建议: [],
    },
    groups: analysis.groups.map(g => ({
      groupId: g.id,
      title: g.title,
      summary: `Changes ${g.files.length} file(s) in ${g.layer} layer.`,
      files: g.files,
      risk: g.riskLevel,
    })),
    metadata: {
      totalAdditions: options.additions,
      totalDeletions: options.deletions,
      filesChanged: options.filesChanged,
      languages: [...new Set(analysis.chunks.map(c => c.language.language))],
      estimatedReviewTime: estimateReviewTime(options.additions, options.deletions),
    },
    riskAssessment: {
      level: analysis.blastRadius.riskLevel,
      reasons: [
        ...(analysis.archImpact.crossLayerChanges ? ["Cross-layer changes"] : []),
        ...(analysis.archImpact.securityImpact ? ["Security-related changes"] : []),
        ...(analysis.archImpact.databaseImpact ? ["Database changes"] : []),
        ...(analysis.complexity.aggregate.longFunctions.length > 0
          ? [`${analysis.complexity.aggregate.longFunctions.length} long function(s)`]
          : []),
      ],
    },
  };
}

export async function generateAISummaries(
  analysis: ReviewAnalysis,
  options: ReviewPromptOptions,
  aiConfig: AIConfig,
): Promise<PRSummaries> {
  const prompt = buildSummaryPrompt(analysis, options);

  try {
    const apiKey = (aiConfig.apiKeys as any)[aiConfig.provider];
    if (!apiKey) return generateFallbackSummaries(analysis, options);

    const adapter = getAIAdapter(aiConfig.provider as any);
    const adapterConfig: AdapterAIConfig = {
      provider: aiConfig.provider as any,
      model: aiConfig.model,
      apiKey,
    };
    const result = await adapter.complete(
      { system: "You are a code review assistant. Always respond with valid JSON only, no markdown fences.", user: prompt },
      adapterConfig,
    );

    const parsed = parseJSONResponse(result.content);
    if (!parsed) return generateFallbackSummaries(analysis, options);

    return {
      overall: {
        title: parsed.overall?.title || options.prTitle,
        summary: parsed.overall?.summary || "Summary unavailable.",
        healthScore: analysis.healthScore.score,
        riskLevel: parsed.riskAssessment?.level || analysis.blastRadius.riskLevel,
        keyChanges: parsed.overall?.keyChanges || analysis.groups.map(g => g.title),
        testing建议: parsed.overall?.testing建议 || [],
      },
      groups: analysis.groups.map((g, i) => ({
        groupId: g.id,
        title: parsed.groups?.[i]?.title || g.title,
        summary: parsed.groups?.[i]?.summary || `Changes in ${g.layer} layer.`,
        files: g.files,
        risk: g.riskLevel,
      })),
      metadata: {
        totalAdditions: options.additions,
        totalDeletions: options.deletions,
        filesChanged: options.filesChanged,
        languages: [...new Set(analysis.chunks.map(c => c.language.language))],
        estimatedReviewTime: estimateReviewTime(options.additions, options.deletions),
      },
      riskAssessment: {
        level: parsed.riskAssessment?.level || analysis.blastRadius.riskLevel,
        reasons: parsed.riskAssessment?.reasons || [],
      },
    };
  } catch (err) {
    return generateFallbackSummaries(analysis, options);
  }
}

function parseJSONResponse(text: string): any {
  try {
    // Try direct parse
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from markdown fences
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch {}
    }

    // Try finding JSON object in text
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch {}
    }

    return null;
  }
}
