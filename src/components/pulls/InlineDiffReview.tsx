import { DiffView } from "@/components/diff/DiffView";
import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";

interface InlineDiffReviewProps {
  rawDiff: string;
  owner: string;
  repo: string;
  pullNumber: number;
  repoUrl: string;
  currentUser?: any;
  baseSha?: string;
  headSha?: string;
}

/**
 * Wrapper around DiffView that adds inline comment functionality for PR reviews.
 * Shows a comment form when user clicks the "+" button on a diff line.
 */
export function InlineDiffReview({
  rawDiff,
  owner,
  repo,
  pullNumber,
  repoUrl,
  currentUser,
  headSha,
}: InlineDiffReviewProps) {
  const [commentForm, setCommentForm] = useState<{
    filePath: string;
    line: number;
    side: "LEFT" | "RIGHT";
  } | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState(false);

  // Partial File Approvals state
  const [fileApprovals, setFileApprovals] = useState<Record<string, boolean>>({});
  
  // Code Quality state
  const [codeQualityIssues, setCodeQualityIssues] = useState<Array<{
    filePath: string;
    line: number;
    message: string;
    severity: string;
    provider: string;
  }>>([]);

  const fetchApprovals = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/file-approvals`);
      if (res.ok) {
        const data = await res.json();
        const approvalMap: Record<string, boolean> = {};
        for (const approval of data.approvals || []) {
          if (approval.approvedById === currentUser.id) {
            approvalMap[approval.path] = true;
          }
        }
        setFileApprovals(approvalMap);
      }
    } catch {}
  }, [owner, repo, pullNumber, currentUser]);

  const fetchCodeQuality = useCallback(async () => {
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/code-quality`);
      if (res.ok) {
        const data = await res.json();
        setCodeQualityIssues(data);
      }
    } catch {}
  }, [owner, repo, pullNumber]);

  useEffect(() => {
    fetchApprovals();
    fetchCodeQuality();
  }, [fetchApprovals, fetchCodeQuality]);

  const handleApproveFile = useCallback(async (filePath: string, approved: boolean) => {
    try {
      if (approved) {
        // Create approval
        await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/file-approvals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath, commitSha: headSha || "unknown" })
        });
        setFileApprovals(prev => ({ ...prev, [filePath]: true }));
      } else {
        // Delete approval by path (this would need an endpoint to delete by path, 
        // or we can fetch the approval ID and delete it. 
        // The file-approvals.ts POST might handle upsert, but we should hit DELETE if unapproving.
        // Let's assume there's an API, or we just rely on POST for now to overwrite.
        const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/file-approvals`);
        const data = await res.json();
        const approval = data.approvals?.find((a: any) => a.path === filePath && a.approvedById === currentUser.id);
        if (approval) {
           await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/file-approvals/${approval.id}`, {
             method: "DELETE"
           });
        }
        setFileApprovals(prev => ({ ...prev, [filePath]: false }));
      }
    } catch {
       toast.error("Failed to toggle approval");
    }
  }, [owner, repo, pullNumber, headSha, currentUser]);

  const handleAddComment = useCallback(
    (filePath: string, line: number, side: "LEFT" | "RIGHT") => {
      setCommentForm({ filePath, line, side });
      setCommentBody("");
      setSuggestionMode(false);
    },
    [],
  );

  const handleCancel = useCallback(() => {
    setCommentForm(null);
    setCommentBody("");
    setSuggestionMode(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!commentForm || !commentBody.trim()) return;

    setIsSubmitting(true);
    try {
      const payload: any = {
        body: commentBody,
        path: commentForm.filePath,
        line: commentForm.line,
        side: commentForm.side,
      };

      if (headSha) {
        payload.commitSha = headSha;
      }

      // Check for suggestion syntax
      if (
        commentBody.includes("```suggestion") ||
        commentBody.includes("```suggestion\n")
      ) {
        const match = commentBody.match(/```suggestion\n([\s\S]*?)```/);
        if (match) {
          payload.suggestionContent = match[1];
        }
      }

      const res = await fetch(
        `/api/repos/${owner}/${repo}/pulls/${pullNumber}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        toast.success("Comment added");
        setCommentForm(null);
        setCommentBody("");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to add comment");
      }
    } catch {
      toast.error("Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  }, [commentForm, commentBody, owner, repo, pullNumber, headSha]);

  const insertSuggestion = useCallback(() => {
    setSuggestionMode(true);
    setCommentBody(
      (prev) =>
        prev +
        (prev ? "\n" : "") +
        "```suggestion\n// Replace with your suggested code\n```",
    );
  }, []);

  return (
    <div className="space-y-4">
      <DiffView
        rawDiff={rawDiff}
        repoUrl={repoUrl}
        enableComments={!!currentUser}
        onAddComment={handleAddComment}
        fileApprovals={fileApprovals}
        onApproveFile={handleApproveFile}
        codeQualityIssues={codeQualityIssues}
      />

      {/* Floating inline comment form */}
      {commentForm && (
        <div className="fixed bottom-4 right-4 z-50 w-[480px] max-w-[90vw] rounded-lg border bg-card shadow-2xl">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 rounded-t-lg">
            <div className="text-sm font-medium">
              Add comment on{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                {commentForm.filePath}
              </code>
              <span className="text-muted-foreground ml-1">
                line {commentForm.line} ({commentForm.side})
              </span>
            </div>
            <button
              onClick={handleCancel}
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
            >
              &times;
            </button>
          </div>
          <div className="p-4 space-y-3">
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              placeholder="Write a comment... Use ```suggestion blocks for code suggestions."
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              autoFocus
            />
            <div className="flex items-center justify-between">
              <button
                onClick={insertSuggestion}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Insert a code suggestion"
              >
                + Suggestion
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!commentBody.trim() || isSubmitting}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Comment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InlineDiffReview;
