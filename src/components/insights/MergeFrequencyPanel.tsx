import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MergeFrequencyPoint = {
  date?: string;
  week?: string;
  mergeCount: number;
};

type MergeFrequencyResponse = {
  success: boolean;
  data?: {
    bucket: "day" | "week";
    days: number;
    points: MergeFrequencyPoint[];
    forecastPoints?: number;
    forecast?: MergeFrequencyPoint[];
    forecastMethod?: string;
  };
};

type Props = {
  owner: string;
  repo: string;
};

export function MergeFrequencyPanel({ owner, repo }: Props) {
  const [bucket, setBucket] = useState<"day" | "week">("week");
  const [days, setDays] = useState<number>(84);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [points, setPoints] = useState<MergeFrequencyPoint[]>([]);
  const [forecast, setForecast] = useState<MergeFrequencyPoint[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/repos/${owner}/${repo}/analytics/merge-frequency?bucket=${bucket}&days=${days}&forecastPoints=6`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Failed to load merge frequency analytics");
        }

        const payload = (await response.json()) as MergeFrequencyResponse;
        setPoints(payload.data?.points || []);
        setForecast(payload.data?.forecast || []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Unable to load merge frequency data");
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [owner, repo, bucket, days]);

  const chartData = useMemo(() => {
    const historical = points.map((point) => ({
      label: point.date || point.week || "",
      merged: point.mergeCount,
      forecast: null as number | null,
      segment: "historical",
    }));

    if (!forecast.length) {
      return historical;
    }

    const bridgeLabel = forecast[0]?.date || forecast[0]?.week || "";
    const bridgeValue = historical.length ? historical[historical.length - 1]?.merged : null;

    const forecastRows = forecast.map((point, index) => ({
      label: point.date || point.week || `future-${index}`,
      merged: null as number | null,
      forecast: point.mergeCount,
      segment: "forecast",
    }));

    // Add an overlap point so dashed line starts from last historical value.
    if (bridgeValue !== null && bridgeLabel) {
      forecastRows.unshift({
        label: bridgeLabel,
        merged: null,
        forecast: bridgeValue,
        segment: "forecast",
      });
    }

    return [...historical, ...forecastRows];
  }, [points, forecast]);

  const avgMergeCount = useMemo(() => {
    if (!points.length) return 0;
    const total = points.reduce((sum, point) => sum + point.mergeCount, 0);
    return Math.round((total / points.length) * 100) / 100;
  }, [points]);

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Merge Frequency Trend</h3>
          <p className="text-sm text-muted-foreground">
            Historical merge cadence with short-range forecast.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="rounded border border-border bg-background px-2 py-1 text-sm"
            value={bucket}
            onChange={(event) => setBucket(event.target.value as "day" | "week")}
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
          </select>
          <select
            className="rounded border border-border bg-background px-2 py-1 text-sm"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={30}>30d</option>
            <option value={84}>84d</option>
            <option value={180}>180d</option>
          </select>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">Average merged</div>
          <div className="text-lg font-semibold">{avgMergeCount}</div>
        </div>
        <div className="rounded border border-border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">Last period</div>
          <div className="text-lg font-semibold">{points[points.length - 1]?.mergeCount ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">Forecast horizon</div>
          <div className="text-lg font-semibold">{forecast.length ? `${forecast.length} ${bucket}s` : "0"}</div>
        </div>
      </div>

      <div className="h-[320px] w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading merge frequency...</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-600">{error}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  if (typeof value !== "string") return "";
                  if (value.includes("-W")) return value;
                  const parsed = new Date(`${value}T00:00:00.000Z`);
                  if (Number.isNaN(parsed.getTime())) return value;
                  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                }}
              />
              <YAxis allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  borderColor: "hsl(var(--border))",
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="merged"
                name="Merged PRs"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                name="Forecast"
                stroke="hsl(var(--chart-4))"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 5"
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
