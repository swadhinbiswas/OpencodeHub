import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, parseQuery, success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import { getDeveloperWorkloads } from "@/lib/analytics-advanced";

const querySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

async function resolveRepository(owner: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!repoOwner) return null;
  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, repoOwner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
}

type WorkloadRecommendation = {
  priority: "high" | "medium" | "low";
  title: string;
  rationale: string;
  action: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] || 0;
}

function topShare(values: number[], topN: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const top = sorted.slice(0, topN).reduce((sum, value) => sum + value, 0);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return total > 0 ? round2((top / total) * 100) : 0;
}

function buildRecommendations(input: {
  overloadedCount: number;
  underutilizedCount: number;
  averageWorkloadScore: number;
  top3LoadSharePercent: number;
  highPendingReviewContributors: { userName: string; pendingReviews: number }[];
  topContributors: { userName: string; workloadScore: number }[];
  increasingTrendCount: number;
  decreasingTrendCount: number;
}): WorkloadRecommendation[] {
  const recommendations: WorkloadRecommendation[] = [];

  if (input.overloadedCount > 0) {
    const names = input.topContributors.slice(0, 2).map((item) => item.userName).join(", ");
    recommendations.push({
      priority: "high",
      title: "Rebalance overloaded contributors",
      rationale: `${input.overloadedCount} contributor(s) are above workload threshold (>=80).`,
      action: names
        ? `Reduce review/issue load for ${names} by shifting assignments to lower-load contributors.`
        : "Shift reviews and issue assignments to lower-load contributors.",
    });
  }

  if (input.highPendingReviewContributors.length > 0) {
    const targets = input.highPendingReviewContributors
      .slice(0, 3)
      .map((entry) => `${entry.userName} (${entry.pendingReviews})`)
      .join(", ");
    recommendations.push({
      priority: "high",
      title: "Clear review queue bottlenecks",
      rationale: "Pending review queue concentration indicates potential PR latency risk.",
      action: `Prioritize review support for: ${targets}.`,
    });
  }

  if (input.top3LoadSharePercent >= 55) {
    recommendations.push({
      priority: "medium",
      title: "Diversify review ownership",
      rationale: `Top 3 contributors carry ${input.top3LoadSharePercent}% of workload score.`,
      action: "Broaden CODEOWNERS/reviewer pool to distribute review demand across more contributors.",
    });
  }

  if (input.underutilizedCount > 0 && input.overloadedCount > 0) {
    recommendations.push({
      priority: "medium",
      title: "Pair low-load and high-load contributors",
      rationale: "Both overloaded and underutilized contributors are present.",
      action: "Rotate issue ownership and shadow-review tasks toward underutilized team members.",
    });
  }

  if (input.increasingTrendCount > input.decreasingTrendCount && input.averageWorkloadScore >= 50) {
    recommendations.push({
      priority: "low",
      title: "Plan short-term capacity buffer",
      rationale: "More contributors show increasing workload trend than decreasing trend.",
      action: "Limit new concurrent initiatives or delay non-critical review-heavy work in the next sprint.",
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      priority: "low",
      title: "Workload distribution is healthy",
      rationale: "No strong overload bottlenecks detected from current repository signals.",
      action: "Maintain current reviewer rotation and monitor trends weekly.",
    });
  }

  return recommendations;
}

export const GET: APIRoute = withErrorHandler(async ({ params, url, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const parsed = parseQuery(url, querySchema);
  if ("error" in parsed) return parsed.error;

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");
  if (!(await canReadRepo(locals.user?.id, repository, { isAdmin: locals.user?.isAdmin }))) {
    return notFound("Repository not found");
  }

  const days = parsed.data.days ?? 30;
  const limit = parsed.data.limit ?? 50;
  const workloads = await getDeveloperWorkloads({
    repositoryId: repository.id,
    days,
  });

  const totalScore = workloads.reduce((sum, entry) => sum + entry.workloadScore, 0);
  const averageScore = workloads.length > 0 ? round2(totalScore / workloads.length) : 0;
  const overloadedCount = workloads.filter((w) => w.workloadScore >= 80).length;
  const underutilizedCount = workloads.filter((w) => w.workloadScore <= 20).length;
  const increasingTrendCount = workloads.filter((w) => w.trend === "increasing").length;
  const stableTrendCount = workloads.filter((w) => w.trend === "stable").length;
  const decreasingTrendCount = workloads.filter((w) => w.trend === "decreasing").length;
  const workloadScores = workloads.map((entry) => entry.workloadScore);
  const p50 = percentile(workloadScores, 50);
  const p90 = percentile(workloadScores, 90);
  const top3LoadSharePercent = topShare(workloadScores, 3);
  const highPendingReviewContributors = workloads
    .filter((entry) => entry.pendingReviews >= 3)
    .slice(0, 5)
    .map((entry) => ({
      userName: entry.userName,
      pendingReviews: entry.pendingReviews,
    }));
  const recommendations = buildRecommendations({
    overloadedCount,
    underutilizedCount,
    averageWorkloadScore: averageScore,
    top3LoadSharePercent,
    highPendingReviewContributors,
    topContributors: workloads.slice(0, 5).map((entry) => ({
      userName: entry.userName,
      workloadScore: entry.workloadScore,
    })),
    increasingTrendCount,
    decreasingTrendCount,
  });

  return success({
    repositoryId: repository.id,
    days,
    summary: {
      totalContributors: workloads.length,
      averageWorkloadScore: averageScore,
      overloadedCount,
      underutilizedCount,
    },
    trendIntelligence: {
      increasingTrendCount,
      stableTrendCount,
      decreasingTrendCount,
      p50WorkloadScore: p50,
      p90WorkloadScore: p90,
      top3LoadSharePercent,
    },
    recommendations,
    contributors: workloads.slice(0, limit),
  });
});
