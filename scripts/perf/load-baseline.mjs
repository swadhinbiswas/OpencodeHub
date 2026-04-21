#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const baseUrl = (process.env.PERF_BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const paths = (process.env.PERF_PATHS || "/api/health,/api/metrics")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);
const concurrency = Math.max(
  1,
  Number.parseInt(process.env.PERF_CONCURRENCY || "8", 10) || 8,
);
const requestsPerPath = Math.max(
  1,
  Number.parseInt(process.env.PERF_REQUESTS || "100", 10) || 100,
);
const timeoutMs = Math.max(
  1000,
  Number.parseInt(process.env.PERF_TIMEOUT_MS || "10000", 10) || 10000,
);
const maxP95Ms = Math.max(
  1,
  Number.parseFloat(process.env.PERF_MAX_P95_MS || "500") || 500,
);
const outputPath = process.env.PERF_OUTPUT || "";

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function stats(samples) {
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return {
    count: samples.length,
    avgMs: Number(avg.toFixed(2)),
    p50Ms: Number(percentile(samples, 50).toFixed(2)),
    p95Ms: Number(percentile(samples, 95).toFixed(2)),
    p99Ms: Number(percentile(samples, 99).toFixed(2)),
    minMs: Number(Math.min(...samples).toFixed(2)),
    maxMs: Number(Math.max(...samples).toFixed(2)),
  };
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
      },
      signal: controller.signal,
    });

    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function benchmarkPath(path) {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const durations = [];
  const statuses = new Map();
  const failures = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < requestsPerPath) {
      const current = nextIndex++;
      try {
        const result = await fetchWithTimeout(url);
        durations.push(result.durationMs);
        statuses.set(result.status, (statuses.get(result.status) || 0) + 1);
        if (!result.ok) {
          failures.push({ index: current, status: result.status });
        }
      } catch (error) {
        failures.push({
          index: current,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const summary = stats(durations);
  return {
    path,
    url,
    concurrency,
    requests: requestsPerPath,
    statuses: Object.fromEntries(statuses.entries()),
    failures,
    ...summary,
    thresholdMs: maxP95Ms,
    passed: failures.length === 0 && summary.p95Ms <= maxP95Ms,
  };
}

async function main() {
  console.log(`[perf] Base URL: ${baseUrl}`);
  console.log(`[perf] Paths: ${paths.join(", ")}`);
  console.log(
    `[perf] Concurrency: ${concurrency}, requests/path: ${requestsPerPath}, timeout: ${timeoutMs}ms`,
  );
  console.log(`[perf] P95 threshold: ${maxP95Ms}ms`);

  const results = [];
  for (const path of paths) {
    const result = await benchmarkPath(path);
    results.push(result);
    const verdict = result.passed ? "PASS" : "FAIL";
    console.log(
      `[perf] ${verdict} ${path} p95=${result.p95Ms}ms avg=${result.avgMs}ms max=${result.maxMs}ms statuses=${JSON.stringify(result.statuses)}`,
    );
    if (result.failures.length > 0) {
      console.log(`[perf]   failures: ${result.failures.length}`);
    }
  }

  const report = {
    baseUrl,
    concurrency,
    requestsPerPath,
    timeoutMs,
    maxP95Ms,
    generatedAt: new Date().toISOString(),
    results,
  };

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`[perf] Report written to ${outputPath}`);
  }

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    console.error(
      `[perf] ${failed.length} path(s) exceeded the threshold or returned errors.`,
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[perf] Benchmark failed:", error);
  process.exitCode = 1;
});
