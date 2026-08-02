/**
 * Smart Diff Chunker
 * Splits git diffs into semantic chunks for analysis and LLM processing.
 */

import { detectLanguage, type LanguageInfo } from "./language-detect";

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  addedLines: number[];
  removedLines: number[];
}

export interface DiffChunk {
  filePath: string;
  changeType: "added" | "modified" | "deleted" | "renamed";
  oldPath?: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  tokenEstimate: number;
  language: LanguageInfo;
  content: string;
}

const MAX_DIFF_CHARS = 80000;
const CHARS_PER_TOKEN = 4;

export function chunkDiff(rawDiff: string): DiffChunk[] {
  const truncated = rawDiff.length > MAX_DIFF_CHARS
    ? rawDiff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated]"
    : rawDiff;

  const fileSections = splitByFile(truncated);
  return fileSections.map(parseFileDiff).filter(Boolean) as DiffChunk[];
}

function splitByFile(diff: string): string[] {
  const sections: string[] = [];
  const lines = diff.split("\n");
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current.length > 0) {
        sections.push(current.join("\n"));
      }
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push(current.join("\n"));
  }
  return sections;
}

function parseFileDiff(section: string): DiffChunk | null {
  const lines = section.split("\n");
  const headerLine = lines[0];

  // Extract file paths from "diff --git a/path b/path"
  const match = headerLine.match(/diff --git a\/(.+?) b\/(.+)/);
  if (!match) return null;

  const oldPath = match[1];
  const filePath = match[2];

  // Determine change type
  let changeType: DiffChunk["changeType"] = "modified";
  if (lines.some(l => l.startsWith("new file"))) changeType = "added";
  else if (lines.some(l => l.startsWith("deleted file"))) changeType = "deleted";
  else if (lines.some(l => l.startsWith("rename from"))) changeType = "renamed";

  let additions = 0;
  let deletions = 0;
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        oldStart: parseInt(hunkMatch[1]),
        oldLines: parseInt(hunkMatch[2] || "1"),
        newStart: parseInt(hunkMatch[3]),
        newLines: parseInt(hunkMatch[4] || "1"),
        content: "",
        addedLines: [],
        removedLines: [],
      };
      continue;
    }

    if (currentHunk) {
      currentHunk.content += line + "\n";
      if (line.startsWith("+") && !line.startsWith("+++")) {
        additions++;
        currentHunk.addedLines.push(currentHunk.newStart + currentHunk.addedLines.length);
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        deletions++;
        currentHunk.removedLines.push(currentHunk.oldStart + currentHunk.removedLines.length);
      }
    }
  }

  if (currentHunk) hunks.push(currentHunk);

  const language = detectLanguage(filePath);
  const content = hunks.map(h => h.content).join("\n");

  return {
    filePath,
    changeType,
    oldPath: changeType === "renamed" ? oldPath : undefined,
    additions,
    deletions,
    hunks,
    tokenEstimate: Math.ceil(content.length / CHARS_PER_TOKEN),
    language,
    content,
  };
}

export function estimateTotalTokens(chunks: DiffChunk[]): number {
  return chunks.reduce((sum, c) => sum + c.tokenEstimate, 0);
}

export function groupChunksByLanguage(chunks: DiffChunk[]): Map<string, DiffChunk[]> {
  const groups = new Map<string, DiffChunk[]>();
  for (const chunk of chunks) {
    const lang = chunk.language.language;
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang)!.push(chunk);
  }
  return groups;
}

export function getDiffStats(chunks: DiffChunk[]) {
  return {
    totalFiles: chunks.length,
    totalAdditions: chunks.reduce((s, c) => s + c.additions, 0),
    totalDeletions: chunks.reduce((s, c) => s + c.deletions, 0),
    totalChanges: chunks.reduce((s, c) => s + c.additions + c.deletions, 0),
    totalTokens: estimateTotalTokens(chunks),
    filesByLanguage: groupChunksByLanguage(chunks).size,
  };
}
