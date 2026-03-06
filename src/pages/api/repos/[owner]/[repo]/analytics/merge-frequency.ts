import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, parseQuery, success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import { getRepoStats } from "@/lib/analytics";

const querySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).optional(),
  bucket: z.enum(["day", "week"]).optional(),
  forecastPoints: z.coerce.number().int().min(0).max(26).optional(),
});

type DailyPoint = {
  date: string;
  cycleTime: number;
  mergeCount: number;
  reviewTime: number;
};

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

function isoDateToWeekKey(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function aggregateWeekly(points: DailyPoint[]) {
  const byWeek = new Map<string, {
    mergeCount: number;
    cycleWeighted: number;
    reviewWeighted: number;
  }>();

  for (const point of points) {
    const week = isoDateToWeekKey(point.date);
    const current = byWeek.get(week) || {
      mergeCount: 0,
      cycleWeighted: 0,
      reviewWeighted: 0,
    };
    current.mergeCount += point.mergeCount;
    current.cycleWeighted += point.cycleTime * point.mergeCount;
    current.reviewWeighted += point.reviewTime * point.mergeCount;
    byWeek.set(week, current);
  }

  return Array.from(byWeek.entries())
    .map(([week, value]) => ({
      week,
      mergeCount: value.mergeCount,
      cycleTime: value.mergeCount > 0
        ? Math.round((value.cycleWeighted / value.mergeCount) * 100) / 100
        : 0,
      reviewTime: value.mergeCount > 0
        ? Math.round((value.reviewWeighted / value.mergeCount) * 100) / 100
        : 0,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

function toSeries(points: { mergeCount: number }[]): number[] {
  return points.map((point) => point.mergeCount);
}

function movingAverageForecast(series: number[], horizon: number, windowSize = 4): number[] {
  const values = [...series];
  const output: number[] = [];

  for (let i = 0; i < horizon; i++) {
    const window = values.slice(Math.max(0, values.length - windowSize));
    const avg = window.length > 0
      ? window.reduce((sum, value) => sum + value, 0) / window.length
      : 0;
    const forecastValue = Math.max(0, Math.round(avg * 100) / 100);
    output.push(forecastValue);
    values.push(forecastValue);
  }

  return output;
}

function addDaysUtc(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function addWeeksIso(weekKey: string, weeks: number): string {
  const [yearPart, weekPart] = weekKey.split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);
  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    return weekKey;
  }

  const base = new Date(Date.UTC(year, 0, 4));
  const day = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() + ((week - 1) * 7) - (day - 1));
  base.setUTCDate(base.getUTCDate() + (weeks * 7));
  return isoDateToWeekKey(base.toISOString().slice(0, 10));
}

function buildDailyForecast(points: DailyPoint[], horizon: number) {
  if (!points.length || horizon <= 0) return [];
  const lastDate = points[points.length - 1]?.date;
  if (!lastDate) return [];

  const series = toSeries(points);
  const forecastValues = movingAverageForecast(series, horizon, 7);
  return forecastValues.map((mergeCount, index) => ({
    date: addDaysUtc(lastDate, index + 1),
    mergeCount,
  }));
}

function buildWeeklyForecast(points: ReturnType<typeof aggregateWeekly>, horizon: number) {
  if (!points.length || horizon <= 0) return [];
  const lastWeek = points[points.length - 1]?.week;
  if (!lastWeek) return [];

  const series = toSeries(points);
  const forecastValues = movingAverageForecast(series, horizon, 4);
  return forecastValues.map((mergeCount, index) => ({
    week: addWeeksIso(lastWeek, index + 1),
    mergeCount,
  }));
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
  const bucket = parsed.data.bucket || "day";
  const forecastPoints = parsed.data.forecastPoints ?? 0;

  const stats = await getRepoStats(repository.id, days);
  if (bucket === "week") {
    const weeklyPoints = aggregateWeekly(stats);
    const forecast = buildWeeklyForecast(weeklyPoints, forecastPoints);
    return success({
      repositoryId: repository.id,
      bucket,
      days,
      points: weeklyPoints,
      forecastPoints,
      forecast,
      forecastMethod: "moving_average",
    });
  }

  const forecast = buildDailyForecast(stats, forecastPoints);
  return success({
    repositoryId: repository.id,
    bucket,
    days,
    points: stats,
    forecastPoints,
    forecast,
    forecastMethod: "moving_average",
  });
});
