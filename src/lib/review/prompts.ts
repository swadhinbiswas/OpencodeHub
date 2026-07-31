/**
 * LLM Prompt Templates for AI Code Review
 * Constructs structured prompts for multi-level review and summarization.
 */

import type { ReviewAnalysis } from "./pipeline";
import type { ChangeGroup } from "./change-grouper";

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

export function buildFullReviewPrompt(
  analysis: ReviewAnalysis,
  options: ReviewPromptOptions,
  diffContent: string,
): string {
  return `You are an expert code reviewer for a self-hosted Git platform called OpenCodeHub.

## PR Context
- **Repository:** ${options.owner}/${options.repoName}
- **Title:** ${options.prTitle}
- **Branch:** ${options.branch}
- **Changes:** ${options.filesChanged} files, +${options.additions}/-${options.deletions} lines

## Analysis Results

### Health Score: ${analysis.healthScore.score}/100 (${analysis.healthScore.grade})
${analysis.healthScore.factors.map(f => `- ${f.name}: ${f.score}/100 — ${f.description}`).join("\n")}

### Blast Radius: ${analysis.blastRadius.riskLevel} risk
${analysis.blastRadius.summary}

### Architecture Impact
${analysis.archImpact.layers.map(l => `- ${l.layer}: ${l.changeCount} file(s), severity: ${l.severity}`).join("\n")}
${analysis.archImpact.crossLayerChanges ? "⚠️ Cross-layer changes detected!" : ""}
${analysis.archImpact.securityImpact ? "🔒 Security-related files modified!" : ""}

### Change Groups
${analysis.groups.map(g => `- **${g.title}** (${g.layer}, ${g.riskLevel} risk): ${g.files.join(", ")}`).join("\n")}

### Complexity
- Cyclomatic complexity: ${analysis.complexity.aggregate.cyclomaticComplexity}
- Max nesting depth: ${analysis.complexity.aggregate.nestingDepth}
- Long functions: ${analysis.complexity.aggregate.longFunctions.length}

## Diff Content
\`\`\`diff
${diffContent}
\`\`\`

## Instructions

Review this PR and provide a JSON response with the following structure:
{
  "summary": "One-paragraph overall summary of the PR",
  "overallSeverity": "info|warning|error|critical",
  "keyChanges": ["List of key changes"],
  "suggestions": [
    {
      "path": "file path",
      "line": line_number,
      "severity": "info|warning|error|critical",
      "type": "bug|security|performance|style|documentation|suggestion",
      "title": "Short title",
      "message": "Detailed message",
      "suggestedFix": "optional code fix",
      "explanation": "Why this matters",
      "confidence": 0.0-1.0,
      "category": "code-quality|security|performance|architecture|testing"
    }
  ],
  "testing建议": ["What tests should be added or updated"],
  "risks": ["Potential risks if merged"],
  "positiveAspects": ["What was done well"]
}

Focus on:
1. Bugs and correctness issues
2. Security vulnerabilities
3. Performance concerns
4. Architecture and design patterns
5. Code maintainability
6. Missing error handling
7. Missing tests

Be specific and actionable. Reference exact file paths and line numbers.`;
}

export function buildGroupReviewPrompt(
  group: ChangeGroup,
  diffContent: string,
  options: ReviewPromptOptions,
): string {
  return `You are reviewing a specific change group in a PR.

## PR: ${options.prTitle} (${options.owner}/${options.repoName})

## Change Group: ${group.title}
- Layer: ${group.layer}
- Risk: ${group.riskLevel}
- Files: ${group.files.join(", ")}
- Complexity: cyclomatic=${group.complexity.cyclomaticComplexity}, nesting=${group.complexity.nestingDepth}

## Diff for this group
\`\`\`diff
${diffContent}
\`\`\`

## Instructions

Provide a JSON response:
{
  "summary": "One-paragraph summary of this change group",
  "riskLevel": "low|medium|high|critical",
  "suggestions": [
    {
      "path": "file path",
      "line": line_number,
      "severity": "info|warning|error|critical",
      "type": "bug|security|performance|style|documentation|suggestion",
      "title": "Short title",
      "message": "Detailed message",
      "suggestedFix": "optional code fix",
      "confidence": 0.0-1.0
    }
  ]
}`;
}

export function buildSummaryPrompt(
  analysis: ReviewAnalysis,
  options: ReviewPromptOptions,
): string {
  return `Generate a concise, multi-level summary for this PR.

## PR: ${options.prTitle}
## Repository: ${options.owner}/${options.repoName}
## Changes: ${options.filesChanged} files, +${options.additions}/-${options.deletions}

## Change Groups
${analysis.groups.map(g => `### ${g.title}
- Files: ${g.files.join(", ")}
- Layer: ${g.layer}
- Risk: ${g.riskLevel}
- Additions: +${g.totalAdditions}, Deletions: -${g.totalDeletions}
`).join("\n")}

## Architecture
- Layers affected: ${analysis.archImpact.affectedLayers.join(", ")}
- Cross-layer: ${analysis.archImpact.crossLayerChanges}
- Security impact: ${analysis.archImpact.securityImpact}
- Database impact: ${analysis.archImpact.databaseImpact}

## Health Score: ${analysis.healthScore.score}/100 (${analysis.healthScore.grade})

## Instructions

Return JSON:
{
  "overall": {
    "title": "Concise PR title (if current is too long)",
    "summary": "2-3 sentence PR summary",
    "keyChanges": ["Bullet point 1", "Bullet point 2", ...],
    "testing建议": ["Test suggestion 1", "Test suggestion 2", ...]
  },
  "groups": [
    {
      "groupId": "group-1",
      "title": "Group title",
      "summary": "One-sentence summary of this group"
    }
  ],
  "riskAssessment": {
    "level": "low|medium|high|critical",
    "reasons": ["Reason 1", "Reason 2"]
  }
}`;
}
