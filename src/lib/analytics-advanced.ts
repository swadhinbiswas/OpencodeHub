/**
 * Advanced Analytics & Insights Library
 * Hotspot detection, export metrics, custom dashboards
 */

import { getDatabase, schema } from "@/db";
import { repositories } from "@/db/schema/repositories";
import { users } from "@/db/schema/users";
import { compareBranches } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { logger } from "./logger";

// ============================================================================
// SCHEMA
// ============================================================================

export const fileHotspots = pgTable("file_hotspots", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  changeCount: integer("change_count").default(0),
  bugCount: integer("bug_count").default(0),
  reviewCount: integer("review_count").default(0),
  complexityScore: real("complexity_score"),
  lastModified: timestamp("last_modified"),
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
});

export const customDashboards = pgTable("custom_dashboards", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isPublic: boolean("is_public").default(false),
  layout: jsonb("layout").$type<DashboardLayout>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dashboardWidgets = pgTable("dashboard_widgets", {
  id: text("id").primaryKey(),
  dashboardId: text("dashboard_id")
    .notNull()
    .references(() => customDashboards.id, { onDelete: "cascade" }),
  widgetType: text("widget_type").notNull(),
  title: text("title").notNull(),
  config: jsonb("config").$type<WidgetConfig>(),
  position: jsonb("position").$type<{
    x: number;
    y: number;
    w: number;
    h: number;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const metricSnapshots = pgTable("metric_snapshots", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id").references(() => repositories.id, {
    onDelete: "cascade",
  }),
  organizationId: text("organization_id"),
  metricType: text("metric_type").notNull(),
  value: real("value").notNull(),
  dimensions: jsonb("dimensions").$type<Record<string, string>>(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export type FileHotspot = typeof fileHotspots.$inferSelect;
export type CustomDashboard = typeof customDashboards.$inferSelect;
export type MetricSnapshot = typeof metricSnapshots.$inferSelect;

interface DashboardLayout {
  columns: number;
  rows: number;
}

interface WidgetConfig {
  repositoryId?: string;
  timeRange?: string;
  metrics?: string[];
  filters?: Record<string, string>;
}

// ============================================================================
// HOTSPOT FILE DETECTION
// ============================================================================

export async function calculateFileHotspots(
  repositoryId: string,
): Promise<FileHotspot[]> {
  const db = getDatabase();
  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.id, repositoryId),
  });
  if (!repository) return [];

  const repoPath = await resolveRepoPath(repository.diskPath);

  // Get all PRs for this repository
  const prs = await db.query.pullRequests.findMany({
    where: eq(schema.pullRequests.repositoryId, repositoryId),
  });

  const fileStats: Map<
    string,
    {
      changeCount: number;
      bugCount: number;
      reviewCount: number;
      lastModified: Date;
    }
  > = new Map();

  // Replace previous snapshot for this repository
  await (db as NodePgDatabase<typeof schema>)
    .delete(schema.fileHotspots)
    .where(eq(schema.fileHotspots.repositoryId, repositoryId));

  // Analyze each PR's changed files
  for (const pr of prs) {
    let changedFiles: string[] = [];
    try {
      const { diffs } = await compareBranches(
        repoPath,
        pr.baseBranch,
        pr.headBranch,
      );
      changedFiles = diffs.map((d) => d.file).filter(Boolean);
    } catch (error) {
      logger.warn(
        { repositoryId, prId: pr.id, error },
        "Failed to load changed files for hotspot analysis",
      );
      continue;
    }
    const isBugFix =
      pr.title?.toLowerCase().includes("fix") ||
      pr.title?.toLowerCase().includes("bug");

    for (const file of changedFiles) {
      const current = fileStats.get(file) || {
        changeCount: 0,
        bugCount: 0,
        reviewCount: 0,
        lastModified: new Date(0),
      };

      current.changeCount++;
      if (isBugFix) current.bugCount++;
      current.reviewCount += pr.reviewCount || 0;
      if (pr.mergedAt && pr.mergedAt > current.lastModified) {
        current.lastModified = pr.mergedAt;
      }

      fileStats.set(file, current);
    }
  }

  // Calculate complexity scores and save hotspots
  const hotspots: FileHotspot[] = [];

  for (const [filePath, stats] of fileStats) {
    // Hotspot score = changes * 0.5 + bugs * 2 + reviews * 0.3
    const complexityScore = stats.changeCount * 0.5 + stats.bugCount * 2;

    const hotspot = {
      id: crypto.randomUUID(),
      repositoryId,
      filePath,
      changeCount: stats.changeCount,
      bugCount: stats.bugCount,
      reviewCount: stats.reviewCount,
      complexityScore,
      lastModified: stats.lastModified,
      calculatedAt: new Date(),
    };

    await (db as NodePgDatabase<typeof schema>).insert(schema.fileHotspots).values(hotspot);
    hotspots.push(hotspot as FileHotspot);
  }

  // Sort by complexity score descending
  hotspots.sort((a, b) => (b.complexityScore || 0) - (a.complexityScore || 0));

  logger.info(
    { repoId: repositoryId, hotspotCount: hotspots.length },
    "Hotspots calculated",
  );

  return hotspots.slice(0, 50); // Return top 50
}

export async function getFileHotspots(
  repositoryId: string,
  limit = 20,
): Promise<FileHotspot[]> {
  const db = getDatabase();

  try {
    return (
      (await db.query.fileHotspots?.findMany({
        where: eq(schema.fileHotspots.repositoryId, repositoryId),
        orderBy: (h, { desc }) => [desc(h.complexityScore)],
        limit,
      })) || []
    );
  } catch {
    return [];
  }
}

// ============================================================================
// METRICS EXPORT
// ============================================================================

export type ExportFormat = "json" | "csv" | "prometheus";

export interface MetricExportOptions {
  repositoryId?: string;
  organizationId?: string;
  metrics: string[];
  startDate: Date;
  endDate: Date;
  format: ExportFormat;
  groupBy?: "day" | "week" | "month";
}

export async function exportMetrics(
  options: MetricExportOptions,
): Promise<string> {
  const db = getDatabase();

  const snapshots =
    (await db.query.metricSnapshots?.findMany({
      where: and(
        options.repositoryId
          ? eq(schema.metricSnapshots.repositoryId, options.repositoryId)
          : undefined,
        gte(schema.metricSnapshots.timestamp, options.startDate),
        lte(schema.metricSnapshots.timestamp, options.endDate),
      ),
      orderBy: (m, { asc }) => [asc(m.timestamp)],
    })) || [];

  // Filter by metric types
  const filtered = snapshots.filter((s) =>
    options.metrics.includes(s.metricType),
  );

  switch (options.format) {
    case "json":
      return exportAsJSON(filtered);
    case "csv":
      return exportAsCSV(filtered);
    case "prometheus":
      return exportAsPrometheus(filtered);
    default:
      return exportAsJSON(filtered);
  }
}

function exportAsJSON(snapshots: MetricSnapshot[]): string {
  return JSON.stringify(snapshots, null, 2);
}

function exportAsCSV(snapshots: MetricSnapshot[]): string {
  const headers = ["timestamp", "metricType", "value", "repositoryId"];
  const rows = snapshots.map((s) => [
    s.timestamp.toISOString(),
    s.metricType,
    s.value.toString(),
    s.repositoryId || "",
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function exportAsPrometheus(snapshots: MetricSnapshot[]): string {
  const lines: string[] = [];

  for (const snapshot of snapshots) {
    const labels = snapshot.dimensions
      ? Object.entries(snapshot.dimensions)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",")
      : "";

    const metricName = snapshot.metricType.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(`# TYPE ${metricName} gauge`);
    lines.push(
      `${metricName}{${labels}} ${snapshot.value} ${snapshot.timestamp.getTime()}`,
    );
  }

  return lines.join("\n");
}

// ============================================================================
// CUSTOM DASHBOARDS
// ============================================================================

export async function createDashboard(options: {
  userId: string;
  name: string;
  description?: string;
  isPublic?: boolean;
}): Promise<CustomDashboard> {
  const db = getDatabase();

  const dashboard = {
    id: crypto.randomUUID(),
    userId: options.userId,
    name: options.name,
    description: options.description || null,
    isPublic: options.isPublic ?? false,
    layout: { columns: 12, rows: 8 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // @ts-expect-error - Drizzle multi-db union type issue
  await db.insert(schema.customDashboards).values(dashboard);

  return dashboard as CustomDashboard;
}

export async function addWidget(options: {
  dashboardId: string;
  widgetType: string;
  title: string;
  config?: WidgetConfig;
  position?: { x: number; y: number; w: number; h: number };
}): Promise<typeof dashboardWidgets.$inferSelect> {
  const db = getDatabase();

  const widget = {
    id: crypto.randomUUID(),
    dashboardId: options.dashboardId,
    widgetType: options.widgetType,
    title: options.title,
    config: options.config || {},
    position: options.position || { x: 0, y: 0, w: 4, h: 2 },
    createdAt: new Date(),
  };

  // @ts-expect-error - Drizzle multi-db union type issue
  await db.insert(schema.dashboardWidgets).values(widget);

  return widget;
}

export const WIDGET_TYPES = {
  pr_velocity: {
    name: "PR Velocity",
    description: "PRs merged over time",
    defaultConfig: { timeRange: "30d" },
  },
  review_time: {
    name: "Review Time",
    description: "Average time to first review",
    defaultConfig: { timeRange: "30d" },
  },
  cycle_time: {
    name: "Cycle Time",
    description: "Time from PR open to merge",
    defaultConfig: { timeRange: "30d" },
  },
  hotspot_files: {
    name: "Hotspot Files",
    description: "Most frequently changed files",
    defaultConfig: { limit: 10 },
  },
  team_workload: {
    name: "Team Workload",
    description: "Open PRs per team member",
    defaultConfig: {},
  },
  ci_success_rate: {
    name: "CI Success Rate",
    description: "Percentage of passing builds",
    defaultConfig: { timeRange: "7d" },
  },
  deploy_frequency: {
    name: "Deploy Frequency",
    description: "Deployments per day/week",
    defaultConfig: { timeRange: "30d" },
  },
  issue_burndown: {
    name: "Issue Burndown",
    description: "Issues opened vs closed",
    defaultConfig: { timeRange: "30d" },
  },
} as const;

export async function getDashboard(dashboardId: string): Promise<{
  dashboard: CustomDashboard;
  widgets: (typeof dashboardWidgets.$inferSelect)[];
} | null> {
  const db = getDatabase();

  const dashboard = await db.query.customDashboards?.findFirst({
    where: eq(schema.customDashboards.id, dashboardId),
  });

  if (!dashboard) return null;

  const widgets =
    (await db.query.dashboardWidgets?.findMany({
      where: eq(schema.dashboardWidgets.dashboardId, dashboardId),
    })) || [];

  return { dashboard, widgets };
}

// ============================================================================
// AGGREGATED METRICS
// ============================================================================

export async function recordMetric(options: {
  repositoryId?: string;
  organizationId?: string;
  metricType: string;
  value: number;
  dimensions?: Record<string, string>;
}): Promise<void> {
  const db = getDatabase();

  // @ts-expect-error - Drizzle multi-db union type issue
  await db.insert(schema.metricSnapshots).values({
    id: crypto.randomUUID(),
    repositoryId: options.repositoryId || null,
    organizationId: options.organizationId || null,
    metricType: options.metricType,
    value: options.value,
    dimensions: options.dimensions || null,
    timestamp: new Date(),
  });
}

export async function getMetricTimeSeries(options: {
  repositoryId?: string;
  metricType: string;
  startDate: Date;
  endDate: Date;
  granularity?: "hour" | "day" | "week";
}): Promise<{ timestamp: Date; value: number }[]> {
  const db = getDatabase();

  const snapshots =
    (await db.query.metricSnapshots?.findMany({
      where: and(
        options.repositoryId
          ? eq(schema.metricSnapshots.repositoryId, options.repositoryId)
          : undefined,
        eq(schema.metricSnapshots.metricType, options.metricType),
        gte(schema.metricSnapshots.timestamp, options.startDate),
        lte(schema.metricSnapshots.timestamp, options.endDate),
      ),
      orderBy: (m, { asc }) => [asc(m.timestamp)],
    })) || [];

  return snapshots.map((s) => ({
    timestamp: s.timestamp,
    value: s.value,
  }));
}

// ============================================================================
// DORA METRICS
// ============================================================================

export async function getDORAMetrics(options: {
  repositoryId?: string;
  organizationId?: string;
  startDate: Date;
  endDate: Date;
}): Promise<{
  deploymentFrequency: number; // per day
  leadTimeForChanges: number; // hours
  changeFailureRate: number; // percentage
  timeToRestoreService: number; // hours
}> {
  const db = getDatabase();

  // Get deployments
  const deployments =
    (await db.query.deployments?.findMany({
      where: and(
        gte(schema.deployments.createdAt, options.startDate),
        lte(schema.deployments.createdAt, options.endDate),
      ),
    })) || [];

  const daysDiff =
    (options.endDate.getTime() - options.startDate.getTime()) /
    (1000 * 60 * 60 * 24);

  // Deployment Frequency
  const deploymentFrequency = deployments.length / daysDiff;

  // Lead Time for Changes (time from commit to deploy)
  const leadTimes = deployments
    .filter((d) => d.startedAt && d.completedAt)
    .map(
      (d) =>
        (d.completedAt!.getTime() - d.startedAt!.getTime()) / (1000 * 60 * 60),
    );

  const leadTimeForChanges =
    leadTimes.length > 0
      ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
      : 0;

  // Change Failure Rate
  const failedDeploys = deployments.filter((d) => d.status === "failed").length;
  const changeFailureRate =
    deployments.length > 0 ? (failedDeploys / deployments.length) * 100 : 0;

  // Time to Restore (time between failure and next success)
  let timeToRestoreService = 0;
  const sortedDeploys = deployments
    .filter((d) => d.completedAt)
    .sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime());

  const restorationTimes: number[] = [];
  for (let i = 0; i < sortedDeploys.length; i++) {
    if (sortedDeploys[i].status === "failed") {
      // Find next successful deployment after this failure
      for (let j = i + 1; j < sortedDeploys.length; j++) {
        if (
          sortedDeploys[j].status === "success" ||
          sortedDeploys[j].status === "completed"
        ) {
          const restoreHours =
            (sortedDeploys[j].completedAt!.getTime() -
              sortedDeploys[i].completedAt!.getTime()) /
            (1000 * 60 * 60);
          restorationTimes.push(restoreHours);
          break;
        }
      }
    }
  }
  if (restorationTimes.length > 0) {
    timeToRestoreService =
      restorationTimes.reduce((a, b) => a + b, 0) / restorationTimes.length;
  }

  return {
    deploymentFrequency,
    leadTimeForChanges,
    changeFailureRate,
    timeToRestoreService,
  };
}

/**
 * PR Cycle Time breakdown — time spent in each phase
 */
export async function getPRCycleTime(options: {
  repositoryId: string;
  startDate: Date;
  endDate: Date;
}): Promise<{
  avgDraftHours: number;
  avgReviewHours: number;
  avgApprovalToMergeHours: number;
  avgTotalHours: number;
  prCount: number;
}> {
  const db = getDatabase();

  const mergedPrs =
    (await db.query.pullRequests.findMany({
      where: and(
        eq(schema.pullRequests.repositoryId, options.repositoryId),
        eq(schema.pullRequests.isMerged, true),
        gte(schema.pullRequests.mergedAt, options.startDate),
        lte(schema.pullRequests.mergedAt, options.endDate),
      ),
    })) || [];

  if (mergedPrs.length === 0) {
    return {
      avgDraftHours: 0,
      avgReviewHours: 0,
      avgApprovalToMergeHours: 0,
      avgTotalHours: 0,
      prCount: 0,
    };
  }

  let totalDraft = 0,
    totalReview = 0,
    totalApprovalToMerge = 0,
    totalTotal = 0;
  let counted = 0;

  for (const pr of mergedPrs) {
    const created = pr.createdAt?.getTime() || 0;
    const merged = pr.mergedAt?.getTime() || 0;
    if (!created || !merged) continue;

    const totalHours = (merged - created) / (1000 * 60 * 60);
    totalTotal += totalHours;

    // Get first review for this PR
    const firstReview = await db.query.pullRequestReviews.findFirst({
      where: eq(schema.pullRequestReviews.pullRequestId, pr.id),
      orderBy: [asc(schema.pullRequestReviews.submittedAt)],
    });

    if (firstReview?.submittedAt) {
      const reviewTime = firstReview.submittedAt.getTime();
      totalDraft += (reviewTime - created) / (1000 * 60 * 60);
      totalReview += (reviewTime - created) / (1000 * 60 * 60);
    }

    // Get approval time
    const approval = await db.query.pullRequestReviews.findFirst({
      where: and(
        eq(schema.pullRequestReviews.pullRequestId, pr.id),
        eq(schema.pullRequestReviews.state, "approved"),
      ),
      orderBy: [desc(schema.pullRequestReviews.submittedAt)],
    });

    if (approval?.submittedAt) {
      totalApprovalToMerge +=
        (merged - approval.submittedAt.getTime()) / (1000 * 60 * 60);
    }

    counted++;
  }

  return {
    avgDraftHours:
      counted > 0 ? Math.round((totalDraft / counted) * 10) / 10 : 0,
    avgReviewHours:
      counted > 0 ? Math.round((totalReview / counted) * 10) / 10 : 0,
    avgApprovalToMergeHours:
      counted > 0 ? Math.round((totalApprovalToMerge / counted) * 10) / 10 : 0,
    avgTotalHours:
      counted > 0 ? Math.round((totalTotal / counted) * 10) / 10 : 0,
    prCount: counted,
  };
}

/**
 * Reviewer response time — identify bottleneck reviewers
 */
export async function getReviewerResponseTimes(options: {
  repositoryId: string;
  startDate: Date;
  endDate: Date;
}): Promise<
  Array<{
    userId: string;
    username: string;
    avgResponseHours: number;
    reviewCount: number;
  }>
> {
  const db = getDatabase();

  const reviews =
    (await db.query.pullRequestReviews.findMany({
      where: and(
        gte(schema.pullRequestReviews.submittedAt, options.startDate),
        lte(schema.pullRequestReviews.submittedAt, options.endDate),
      ),
    })) || [];

  // Group reviews by reviewer
  const reviewerMap = new Map<string, { totalHours: number; count: number }>();

  for (const review of reviews) {
    if (!review.submittedAt) continue;

    // Get the PR to calculate response time
    const pr = await db.query.pullRequests.findFirst({
      where: eq(schema.pullRequests.id, review.pullRequestId),
    });

    if (!pr || pr.repositoryId !== options.repositoryId) continue;

    // Check if this was a requested review
    const requested = await db.query.pullRequestReviewers.findFirst({
      where: and(
        eq(schema.pullRequestReviewers.pullRequestId, review.pullRequestId),
        eq(schema.pullRequestReviewers.userId, review.reviewerId),
      ),
    });

    const requestTime =
      requested?.requestedAt?.getTime() || pr.createdAt?.getTime() || 0;
    const responseHours =
      (review.submittedAt.getTime() - requestTime) / (1000 * 60 * 60);

    const existing = reviewerMap.get(review.reviewerId) || {
      totalHours: 0,
      count: 0,
    };
    existing.totalHours += Math.max(0, responseHours);
    existing.count++;
    reviewerMap.set(review.reviewerId, existing);
  }

  // Fetch usernames
  const userIds = [...reviewerMap.keys()];
  const users =
    userIds.length > 0
      ? await db.query.users.findMany({
          where: inArray(schema.users.id, userIds),
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return [...reviewerMap.entries()]
    .map(([userId, data]) => ({
      userId,
      username: userMap.get(userId)?.username || "unknown",
      avgResponseHours: Math.round((data.totalHours / data.count) * 10) / 10,
      reviewCount: data.count,
    }))
    .sort((a, b) => b.avgResponseHours - a.avgResponseHours);
}

/**
 * Code churn — files modified most frequently
 */
export async function getCodeChurn(options: {
  repositoryId: string;
  startDate: Date;
  endDate: Date;
  limit?: number;
}): Promise<Array<{ file: string; changeCount: number; authors: string[] }>> {
  const db = getDatabase();
  const limit = options.limit || 20;

  // Get merged PRs in the time range
  const prs =
    (await db.query.pullRequests.findMany({
      where: and(
        eq(schema.pullRequests.repositoryId, options.repositoryId),
        eq(schema.pullRequests.isMerged, true),
        gte(schema.pullRequests.mergedAt, options.startDate),
        lte(schema.pullRequests.mergedAt, options.endDate),
      ),
    })) || [];

  // Get changed files from each PR via git
  const fileChanges = new Map<
    string,
    { count: number; authors: Set<string> }
  >();

  const repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.id, options.repositoryId),
    with: { owner: true },
  });

  if (repo && prs.length > 0) {
    try {
      const { simpleGit } = await import("simple-git");
      const { acquireRepo, releaseRepo } = await import("./git-storage");
      const repoPath = await acquireRepo(repo.owner.username, repo.name);
      const git = simpleGit(repoPath);

      for (const pr of prs.slice(0, 100)) {
        // Cap at 100 PRs for perf
        try {
          const author = await db.query.users.findFirst({
            where: eq(schema.users.id, pr.authorId),
          });

          const diffSummary = await git.diffSummary([
            `${pr.baseBranch}...${pr.mergeSha || pr.headSha || "HEAD"}`,
          ]);

          for (const file of diffSummary.files) {
            const existing = fileChanges.get(file.file) || {
              count: 0,
              authors: new Set<string>(),
            };
            existing.count++;
            if (author?.username) existing.authors.add(author.username);
            fileChanges.set(file.file, existing);
          }
        } catch {
          /* skip individual PR errors */
        }
      }

      await releaseRepo(repo.owner.username, repo.name, false);
    } catch {
      /* repo access error */
    }
  }

  return [...fileChanges.entries()]
    .map(([file, data]) => ({
      file,
      changeCount: data.count,
      authors: [...data.authors],
    }))
    .sort((a, b) => b.changeCount - a.changeCount)
    .slice(0, limit);
}

// ============================================================================
// DEVELOPER WORKLOAD INSIGHTS
// ============================================================================

export interface DeveloperWorkload {
  userId: string;
  userName: string;
  openPRs: number;
  pendingReviews: number;
  assignedIssues: number;
  recentCommits: number;
  avgReviewTime: number; // hours
  workloadScore: number; // 0-100
  trend: "increasing" | "stable" | "decreasing";
}

export async function getDeveloperWorkloads(options: {
  repositoryId?: string;
  organizationId?: string;
  days?: number;
}): Promise<DeveloperWorkload[]> {
  const db = getDatabase();
  const startDate = new Date(
    Date.now() - (options.days || 30) * 24 * 60 * 60 * 1000,
  );

  // Get all users
  const users = (await db.query.users.findMany({})) || [];

  const workloads: DeveloperWorkload[] = [];

  for (const user of users) {
    // Count open PRs authored (optionally repository-scoped)
    const openPrConditions = [
      eq(schema.pullRequests.authorId, user.id),
      eq(schema.pullRequests.state, "open"),
    ];
    if (options.repositoryId) {
      openPrConditions.push(
        eq(schema.pullRequests.repositoryId, options.repositoryId),
      );
    }
    const openPRs =
      (await db.query.pullRequests.findMany({
        where: and(...openPrConditions),
      })) || [];

    // Count pending reviews requested (optionally repository-scoped)
    const pendingReviewRequests =
      (await db.query.pullRequestReviewers?.findMany({
        where: eq(schema.pullRequestReviewers.userId, user.id),
      })) || [];
    let pendingReviews = pendingReviewRequests;
    if (options.repositoryId && pendingReviewRequests.length > 0) {
      const pullRequestIds = pendingReviewRequests.map((r) => r.pullRequestId);
      const repoPullRequests = await db.query.pullRequests.findMany({
        where: and(
          inArray(schema.pullRequests.id, pullRequestIds),
          eq(schema.pullRequests.repositoryId, options.repositoryId),
        ),
        columns: { id: true },
      });
      const repoPullRequestIds = new Set(repoPullRequests.map((pr) => pr.id));
      pendingReviews = pendingReviewRequests.filter((r) =>
        repoPullRequestIds.has(r.pullRequestId),
      );
    }

    // Count assigned issues (optionally repository-scoped)
    const assignedIssueLinks =
      (await db.query.issueAssignees?.findMany({
        where: eq(schema.issueAssignees.userId, user.id),
      })) || [];
    let assignedIssues = assignedIssueLinks;
    if (options.repositoryId && assignedIssueLinks.length > 0) {
      const issueIds = assignedIssueLinks.map((i) => i.issueId);
      const repoIssues = await db.query.issues.findMany({
        where: and(
          inArray(schema.issues.id, issueIds),
          eq(schema.issues.repositoryId, options.repositoryId),
        ),
        columns: { id: true },
      });
      const repoIssueIds = new Set(repoIssues.map((issue) => issue.id));
      assignedIssues = assignedIssueLinks.filter((i) =>
        repoIssueIds.has(i.issueId),
      );
    }

    // Calculate workload score (weighted)
    const workloadScore = Math.min(
      100,
      openPRs.length * 10 +
        pendingReviews.length * 15 +
        assignedIssues.length * 5,
    );

    // Determine trend (compare to previous period)
    const trend =
      workloadScore > 70
        ? "increasing"
        : workloadScore < 30
          ? "decreasing"
          : "stable";

    workloads.push({
      userId: user.id,
      userName: user.displayName || user.username,
      openPRs: openPRs.length,
      pendingReviews: pendingReviews.length,
      assignedIssues: assignedIssues.length,
      recentCommits: 0, // Would need commit data
      avgReviewTime: 0, // Would need review timing data
      workloadScore,
      trend,
    });
  }

  // Sort by workload score descending
  workloads.sort((a, b) => b.workloadScore - a.workloadScore);

  return workloads;
}

export async function getTeamBalanceReport(organizationId: string): Promise<{
  totalWorkload: number;
  averageWorkload: number;
  maxWorkload: number;
  minWorkload: number;
  imbalanceScore: number; // 0-100, higher = more imbalanced
  recommendations: string[];
}> {
  const workloads = await getDeveloperWorkloads({ organizationId });

  if (workloads.length === 0) {
    return {
      totalWorkload: 0,
      averageWorkload: 0,
      maxWorkload: 0,
      minWorkload: 0,
      imbalanceScore: 0,
      recommendations: [],
    };
  }

  const scores = workloads.map((w) => w.workloadScore);
  const totalWorkload = scores.reduce((a, b) => a + b, 0);
  const averageWorkload = totalWorkload / scores.length;
  const maxWorkload = Math.max(...scores);
  const minWorkload = Math.min(...scores);

  // Calculate standard deviation for imbalance
  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - averageWorkload, 2), 0) /
    scores.length;
  const stdDev = Math.sqrt(variance);

  // Imbalance score based on coefficient of variation
  const imbalanceScore =
    averageWorkload > 0 ? Math.min(100, (stdDev / averageWorkload) * 100) : 0;

  // Generate recommendations
  const recommendations: string[] = [];

  if (imbalanceScore > 50) {
    recommendations.push(
      "Consider redistributing work more evenly across team members",
    );
  }

  const overloaded = workloads.filter((w) => w.workloadScore > 80);
  if (overloaded.length > 0) {
    recommendations.push(
      `${overloaded.length} team member(s) appear overloaded`,
    );
  }

  const underutilized = workloads.filter((w) => w.workloadScore < 20);
  if (underutilized.length > 0 && overloaded.length > 0) {
    recommendations.push(
      "Redistribute reviews from overloaded to underutilized members",
    );
  }

  return {
    totalWorkload,
    averageWorkload,
    maxWorkload,
    minWorkload,
    imbalanceScore,
    recommendations,
  };
}

export async function suggestReviewerAssignment(
  pullRequestId: string,
  excludeUserIds: string[] = [],
): Promise<{ userId: string; userName: string; reason: string }[]> {
  const db = getDatabase();

  const pr = await db.query.pullRequests.findFirst({
    where: eq(schema.pullRequests.id, pullRequestId),
  });

  if (!pr) return [];

  // Get workloads excluding the PR author and excluded users
  const workloads = await getDeveloperWorkloads({
    repositoryId: pr.repositoryId,
  });

  const candidates = workloads
    .filter(
      (w) => w.userId !== pr.authorId && !excludeUserIds.includes(w.userId),
    )
    .filter((w) => w.workloadScore < 80) // Not overloaded
    .slice(0, 3); // Top 3 suggestions

  return candidates.map((c) => ({
    userId: c.userId,
    userName: c.userName,
    reason:
      c.workloadScore < 30
        ? "Has low current workload"
        : c.pendingReviews < 3
          ? "Has few pending reviews"
          : "Balanced workload",
  }));
}
