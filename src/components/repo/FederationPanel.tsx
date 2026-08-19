import * as React from "react";
import { GitFork, ArrowUpRight, GitPullRequest, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FederationPanelProps {
  owner: string;
  repo: string;
  isFork: boolean;
  forkedFromUrl?: string | null;
  defaultBranch?: string;
}

export function FederationPanel({
  owner,
  repo,
  isFork,
  forkedFromUrl,
  defaultBranch,
}: FederationPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [headBranch, setHeadBranch] = React.useState("");
  const [baseBranch, setBaseBranch] = React.useState(defaultBranch || "main");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  if (!isFork) return null;

  const run = async (path: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/federation/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      const data = json?.data ?? json;
      const errorMessage =
        json?.error || (typeof data === "string" ? data : null) || json?.message;
      if (res.ok) {
        setResult({ ok: true, message: `Done: ${data?.number ? `PR #${data.number}` : `branch ${data?.branch || headBranch || ""}`}` });
      } else {
        setResult({ ok: false, message: errorMessage || `Request failed (${res.status})` });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setBusy(false);
    }
  };

  const pushUpstream = () => {
    if (!headBranch.trim()) return;
    run("push-upstream", { branch: headBranch.trim() });
  };

  const openPull = () => {
    if (!headBranch.trim() || !baseBranch.trim() || !title.trim()) {
      setResult({ ok: false, message: "Head branch, base branch and title are required" });
      return;
    }
    run("open-pull", {
      headBranch: headBranch.trim(),
      baseBranch: baseBranch.trim(),
      title: title.trim(),
      body,
    });
  };

  return (
    <div className="mb-6 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <GitFork className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Forked from another OpenCodeHub instance</span>
          {forkedFromUrl && (
            <a
              href={forkedFromUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#58a6ff] hover:underline"
            >
              {forkedFromUrl.replace(/^https?:\/\//, "")}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
          Contribute upstream
        </Button>
      </div>

      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 border-t border-border pt-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Branch to push
            </label>
            <Input
              value={headBranch}
              onChange={(e) => setHeadBranch(e.target.value)}
              placeholder="feature-branch"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Base branch (upstream)
            </label>
            <Input
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="main"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              PR title (leave blank to only push the branch)
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional: open a cross-instance PR"
            />
          </div>
          {title.trim() && (
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                PR body
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Describe your change…"
              />
            </div>
          )}

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={pushUpstream} disabled={busy || !headBranch.trim()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ArrowUpRight className="h-3.5 w-3.5 mr-1" />}
              Push branch to upstream
            </Button>
            <Button size="sm" variant="secondary" onClick={openPull} disabled={busy}>
              <GitPullRequest className="h-3.5 w-3.5 mr-1" />
              Open cross-instance PR
            </Button>
          </div>

          {result && (
            <p
              className={`sm:col-span-2 text-xs ${result.ok ? "text-emerald-500" : "text-red-500"}`}
            >
              {result.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
