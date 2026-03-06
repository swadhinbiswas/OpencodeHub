import { useEffect, useMemo, useState } from "react";

type Contributor = {
  userId: string;
  userName: string;
  openPRs: number;
  pendingReviews: number;
  assignedIssues: number;
  recentCommits: number;
  avgReviewTime: number;
  workloadScore: number;
  trend: "increasing" | "stable" | "decreasing";
};

type Recommendation = {
  priority: "high" | "medium" | "low";
  title: string;
  rationale: string;
  action: string;
};

type WorkloadPayload = {
  summary: {
    totalContributors: number;
    averageWorkloadScore: number;
    overloadedCount: number;
    underutilizedCount: number;
  };
  trendIntelligence?: {
    increasingTrendCount: number;
    stableTrendCount: number;
    decreasingTrendCount: number;
    p50WorkloadScore: number;
    p90WorkloadScore: number;
    top3LoadSharePercent: number;
  };
  recommendations?: Recommendation[];
  contributors: Contributor[];
};

type WorkloadResponse = {
  success: boolean;
  data?: WorkloadPayload;
};

type Props = {
  owner: string;
  repo: string;
};

function priorityStyles(priority: Recommendation["priority"]): string {
  if (priority === "high") return "text-red-700 bg-red-50 border-red-200";
  if (priority === "medium") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-blue-700 bg-blue-50 border-blue-200";
}

export function DeveloperWorkloadPanel({ owner, repo }: Props) {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [payload, setPayload] = useState<WorkloadPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/repos/${owner}/${repo}/analytics/workload?days=${days}&limit=20`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error("Failed to load workload analytics");
        }
        const parsed = (await response.json()) as WorkloadResponse;
        setPayload(parsed.data || null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Unable to load workload insights");
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [owner, repo, days]);

  const topContributors = useMemo(() => payload?.contributors?.slice(0, 8) || [], [payload]);

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Developer Workload Insights</h3>
          <p className="text-sm text-muted-foreground">
            Trend intelligence and recommendation signals from PR/review/issue load.
          </p>
        </div>

        <select
          className="rounded border border-border bg-background px-2 py-1 text-sm"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value={14}>14d</option>
          <option value={30}>30d</option>
          <option value={90}>90d</option>
        </select>
      </div>

      {loading ? (
        <div className="py-8 text-sm text-muted-foreground">Loading workload insights...</div>
      ) : error ? (
        <div className="py-8 text-sm text-red-600">{error}</div>
      ) : !payload ? (
        <div className="py-8 text-sm text-muted-foreground">No workload data available.</div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Contributors</div>
              <div className="text-lg font-semibold">{payload.summary.totalContributors}</div>
            </div>
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Avg workload score</div>
              <div className="text-lg font-semibold">{payload.summary.averageWorkloadScore}</div>
            </div>
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Overloaded</div>
              <div className="text-lg font-semibold text-red-600">{payload.summary.overloadedCount}</div>
            </div>
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Top 3 load share</div>
              <div className="text-lg font-semibold">{payload.trendIntelligence?.top3LoadSharePercent ?? 0}%</div>
            </div>
          </div>

          {payload.recommendations && payload.recommendations.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recommendations</h4>
              <div className="grid gap-3">
                {payload.recommendations.map((recommendation, index) => (
                  <div key={`${recommendation.title}-${index}`} className="rounded border border-border bg-background p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-medium">{recommendation.title}</div>
                      <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${priorityStyles(recommendation.priority)}`}>
                        {recommendation.priority}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{recommendation.rationale}</p>
                    <p className="mt-1 text-sm">{recommendation.action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top Contributors by Workload</h4>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Contributor</th>
                    <th className="px-3 py-2 font-medium">Workload</th>
                    <th className="px-3 py-2 font-medium">Open PRs</th>
                    <th className="px-3 py-2 font-medium">Pending Reviews</th>
                    <th className="px-3 py-2 font-medium">Assigned Issues</th>
                    <th className="px-3 py-2 font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {topContributors.map((contributor) => (
                    <tr key={contributor.userId} className="border-t">
                      <td className="px-3 py-2 font-medium">{contributor.userName}</td>
                      <td className="px-3 py-2">{contributor.workloadScore}</td>
                      <td className="px-3 py-2">{contributor.openPRs}</td>
                      <td className="px-3 py-2">{contributor.pendingReviews}</td>
                      <td className="px-3 py-2">{contributor.assignedIssues}</td>
                      <td className="px-3 py-2 capitalize">{contributor.trend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
