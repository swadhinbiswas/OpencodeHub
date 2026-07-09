import React, { useState } from "react";

interface DiffLine {
  type: "add" | "del" | "context" | "hunk-header";
  content: string;
  oldLine?: number;
  newLine?: number;
}

interface FileDiff {
  oldPath: string;
  newPath: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
  isBinary: boolean;
}

/**
 * Parse a unified diff string into structured FileDiff objects
 */
const MAX_FILES = 300;
const MAX_LINES = 10000;

export function parseUnifiedDiff(rawDiff: string): { files: FileDiff[], isTruncated: boolean } {
  const files: FileDiff[] = [];
  if (!rawDiff.trim()) return { files, isTruncated: false };

  const diffSections = rawDiff.split(/^diff --git /m).filter(Boolean);
  let totalLinesParsed = 0;
  let isTruncated = false;

  for (const section of diffSections) {
    if (files.length >= MAX_FILES || totalLinesParsed >= MAX_LINES) {
      isTruncated = true;
      break;
    }

    const lines = section.split("\n");
    const headerLine = lines[0] || "";

    // Parse file paths from "a/path b/path"
    const pathMatch = headerLine.match(/a\/(.+?) b\/(.+)/);
    const oldPath = pathMatch?.[1] || "";
    const newPath = pathMatch?.[2] || "";

    const isBinary = section.includes("Binary files");

    let additions = 0;
    let deletions = 0;
    const diffLines: DiffLine[] = [];
    let oldLine = 0;
    let newLine = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Skip git metadata lines
      if (
        line.startsWith("index ") ||
        line.startsWith("---") ||
        line.startsWith("+++") ||
        line.startsWith("old mode") ||
        line.startsWith("new mode") ||
        line.startsWith("new file mode") ||
        line.startsWith("deleted file mode") ||
        line.startsWith("similarity index") ||
        line.startsWith("rename from") ||
        line.startsWith("rename to") ||
        line.startsWith("copy from") ||
        line.startsWith("copy to")
      ) {
        continue;
      }

      // Hunk header
      const hunkMatch = line.match(
        /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/,
      );
      if (hunkMatch) {
        oldLine = parseInt(hunkMatch[1], 10);
        newLine = parseInt(hunkMatch[2], 10);
        diffLines.push({
          type: "hunk-header",
          content: line,
        });
        continue;
      }

      if (line.startsWith("+")) {
        additions++;
        diffLines.push({
          type: "add",
          content: line.slice(1),
          newLine: newLine++,
        });
      } else if (line.startsWith("-")) {
        deletions++;
        diffLines.push({
          type: "del",
          content: line.slice(1),
          oldLine: oldLine++,
        });
      } else if (line.startsWith(" ") || line === "") {
        diffLines.push({
          type: "context",
          content: line.startsWith(" ") ? line.slice(1) : line,
          oldLine: oldLine++,
          newLine: newLine++,
        });
      }
      totalLinesParsed++;
    }

    files.push({
      oldPath,
      newPath,
      additions,
      deletions,
      lines: diffLines,
      isBinary,
    });
  }

  return { files, isTruncated };
}

interface DiffViewProps {
  rawDiff: string;
  /** Base ref name for linking */
  baseRef?: string;
  /** Head ref name for linking */
  headRef?: string;
  /** Repo base URL, e.g. /owner/repo */
  repoUrl?: string;
  /** Show inline comment button on hover (for PR review) */
  enableComments?: boolean;
  /** Callback when user clicks the add comment button on a line */
  onAddComment?: (
    filePath: string,
    line: number,
    side: "LEFT" | "RIGHT",
  ) => void;
  /** Map of file paths to approval status */
  fileApprovals?: Record<string, boolean>;
  /** Callback when user clicks the approve file checkbox */
  onApproveFile?: (filePath: string, approved: boolean) => void;
  /** Code quality issues to show inline */
  codeQualityIssues?: Array<{
    filePath: string;
    line: number;
    message: string;
    severity: string;
    provider: string;
  }>;
}

export function DiffView({
  rawDiff,
  repoUrl,
  enableComments = false,
  onAddComment,
  fileApprovals = {},
  onApproveFile,
  codeQualityIssues,
}: DiffViewProps) {
  const { files, isTruncated } = parseUnifiedDiff(rawDiff);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set());

  const toggleFile = (idx: number) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (files.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No differences found.
      </div>
    );
  }

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <div className="space-y-4">
      {/* File summary */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-medium">
            Showing {files.length} changed file{files.length !== 1 ? "s" : ""}
          </span>
          <span className="text-green-500">+{totalAdditions}</span>
          <span className="text-red-500">-{totalDeletions}</span>
        </div>
        {isTruncated && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm rounded flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
            This diff is too large and has been truncated. Displaying first {files.length} files.
          </div>
        )}
        <div className="mt-3 space-y-1">
          {files.map((file, idx) => (
            <a
              key={idx}
              href={`#diff-${idx}`}
              className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors"
            >
              <DiffBar additions={file.additions} deletions={file.deletions} />
              <span className="text-muted-foreground truncate">
                {file.newPath || file.oldPath}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* File diffs */}
      {files.map((file, fileIdx) => (
        <div
          key={fileIdx}
          id={`diff-${fileIdx}`}
          className="rounded-lg border shadow-sm overflow-hidden"
        >
          {/* File header */}
          <div
            className="bg-muted/30 px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors border-b"
            onClick={() => toggleFile(fileIdx)}
          >
            <div className="flex items-center gap-3 text-sm min-w-0">
              <span className="text-muted-foreground select-none">
                {collapsedFiles.has(fileIdx) ? "▶" : "▼"}
              </span>
              <DiffBar additions={file.additions} deletions={file.deletions} />
              <span className="font-mono truncate">
                {file.oldPath !== file.newPath
                  ? `${file.oldPath} → ${file.newPath}`
                  : file.newPath}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs shrink-0">
              <span className="text-green-500">+{file.additions}</span>
              <span className="text-red-500">-{file.deletions}</span>
              {repoUrl && (
                <a
                  href={`${repoUrl}/blob/HEAD/${file.newPath}`}
                  className="text-blue-400 hover:underline ml-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  View file
                </a>
              )}
              {enableComments && (
                <label className="flex items-center gap-1.5 ml-3 px-2 py-1 bg-muted rounded border border-border cursor-pointer hover:bg-accent transition-colors text-xs" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="rounded border-gray-600 bg-background"
                    checked={!!fileApprovals[file.newPath || file.oldPath]}
                    onChange={(e) => onApproveFile?.(file.newPath || file.oldPath, e.target.checked)}
                  />
                  <span>Viewed</span>
                </label>
              )}
            </div>
          </div>

          {/* Diff lines */}
          {!collapsedFiles.has(fileIdx) && (
            <div className="overflow-x-auto bg-[#0d1117] text-[#c9d1d9] text-sm font-mono">
              {file.isBinary ? (
                <div className="py-8 text-center text-gray-400">
                  Binary file not shown.
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {file.lines.map((line, lineIdx) => {
                      if (line.type === "hunk-header") {
                        return (
                          <tr key={lineIdx} className="bg-[#1c2a3a]">
                            <td
                              colSpan={3}
                              className="px-4 py-1 text-xs text-blue-300 select-none"
                            >
                              {line.content}
                            </td>
                          </tr>
                        );
                      }

                      const bgClass =
                        line.type === "add"
                          ? "bg-[#0d2818]"
                          : line.type === "del"
                            ? "bg-[#2d0f15]"
                            : "";

                      const lineNumClass =
                        line.type === "add"
                          ? "bg-[#0a3519] text-green-600"
                          : line.type === "del"
                            ? "bg-[#3d0f18] text-red-600"
                            : "text-gray-600";

                      const issueForLine =
                        line.newLine && codeQualityIssues
                          ? codeQualityIssues.find(
                              (i) =>
                                i.filePath === (file.newPath || file.oldPath) &&
                                i.line === line.newLine
                            )
                          : undefined;

                      return (
                        <React.Fragment key={lineIdx}>
                        <tr
                          className={`${bgClass} hover:brightness-125 transition-all group`}
                        >
                          {/* Old line number */}
                          <td
                            className={`w-[1%] text-right px-2 py-0 select-none border-r border-gray-800 ${lineNumClass}`}
                          >
                            <div className="leading-6 text-xs relative">
                              {line.type !== "add" ? line.oldLine : ""}
                              {enableComments &&
                                line.type === "del" &&
                                line.oldLine && (
                                  <button
                                    className="absolute -left-1 top-0 opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 leading-6"
                                    title="Add comment"
                                    onClick={() =>
                                      onAddComment?.(
                                        file.newPath || file.oldPath,
                                        line.oldLine!,
                                        "LEFT",
                                      )
                                    }
                                  >
                                    +
                                  </button>
                                )}
                            </div>
                          </td>
                          {/* New line number */}
                          <td
                            className={`w-[1%] text-right px-2 py-0 select-none border-r border-gray-800 ${lineNumClass}`}
                          >
                            <div className="leading-6 text-xs relative">
                              {line.type !== "del" ? line.newLine : ""}
                              {enableComments &&
                                line.type === "add" &&
                                line.newLine && (
                                  <button
                                    className="absolute -left-1 top-0 opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 leading-6"
                                    title="Add comment"
                                    onClick={() =>
                                      onAddComment?.(
                                        file.newPath || file.oldPath,
                                        line.newLine!,
                                        "RIGHT",
                                      )
                                    }
                                  >
                                    +
                                  </button>
                                )}
                            </div>
                          </td>
                          {/* Code */}
                          <td className="px-4 py-0 whitespace-pre">
                            <div className="leading-6">
                              <span
                                className={
                                  line.type === "add"
                                    ? "text-green-400"
                                    : line.type === "del"
                                      ? "text-red-400"
                                      : ""
                                }
                              >
                                {line.type === "add"
                                  ? "+"
                                  : line.type === "del"
                                    ? "-"
                                    : " "}
                                {line.content}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {issueForLine && (
                          <tr className="bg-muted/40">
                            <td colSpan={3} className="px-4 py-3 border-y border-border">
                              <div className="flex items-start gap-2 text-sm font-sans">
                                <div className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${issueForLine.severity === "high" || issueForLine.severity === "critical" ? "bg-red-500" : issueForLine.severity === "medium" ? "bg-amber-500" : "bg-blue-500"}`} />
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    <span className="capitalize">{issueForLine.provider}</span>
                                    <span className="text-xs px-1.5 py-0.5 rounded-sm bg-background border uppercase">{issueForLine.severity}</span>
                                  </div>
                                  <div className="text-muted-foreground mt-1 whitespace-pre-wrap">{issueForLine.message}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DiffBar({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  const total = additions + deletions;
  if (total === 0) return null;
  const maxBlocks = 5;
  const addBlocks = Math.round((additions / total) * maxBlocks);
  const delBlocks = maxBlocks - addBlocks;

  return (
    <span className="inline-flex gap-[1px] shrink-0">
      {Array.from({ length: addBlocks }).map((_, i) => (
        <span key={`a${i}`} className="w-2 h-2 rounded-[1px] bg-green-500" />
      ))}
      {Array.from({ length: delBlocks }).map((_, i) => (
        <span key={`d${i}`} className="w-2 h-2 rounded-[1px] bg-red-500" />
      ))}
    </span>
  );
}

export default DiffView;
