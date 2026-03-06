import client from "prom-client";

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: "opencodehub",
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// ── HTTP Metrics ──────────────────────────────────────────────────────────────
export const httpRequestDurationMicroseconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "code"],
});

export const httpRequestsInFlight = new client.Gauge({
  name: "http_requests_in_flight",
  help: "Number of HTTP requests currently being processed",
});

// ── Database Metrics ──────────────────────────────────────────────────────────
export const dbQueryDuration = new client.Histogram({
  name: "db_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "table"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
});

export const dbQueryErrors = new client.Counter({
  name: "db_query_errors_total",
  help: "Total number of database query errors",
  labelNames: ["operation", "table"],
});

export const dbConnectionPool = new client.Gauge({
  name: "db_connection_pool_size",
  help: "Current database connection pool size",
  labelNames: ["state"], // active, idle, waiting
});

// ── Git Operations ────────────────────────────────────────────────────────────
export const gitOperationDuration = new client.Histogram({
  name: "git_operation_duration_seconds",
  help: "Duration of Git operations in seconds",
  labelNames: ["operation"], // clone, push, pull, merge, diff
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
});

export const gitCloneTotal = new client.Counter({
  name: "git_clone_total",
  help: "Total number of git clone operations",
  labelNames: ["status"],
});

export const gitPushTotal = new client.Counter({
  name: "git_push_total",
  help: "Total number of git push operations",
  labelNames: ["status"],
});

// ── CI/CD Metrics ─────────────────────────────────────────────────────────────
export const activeRunners = new client.Gauge({
  name: "active_runners",
  help: "Number of active CI/CD runners",
});

export const ciJobDuration = new client.Histogram({
  name: "ci_job_duration_seconds",
  help: "Duration of CI/CD job execution",
  labelNames: ["status", "runner"],
  buckets: [10, 30, 60, 120, 300, 600, 1800, 3600],
});

export const ciJobsTotal = new client.Counter({
  name: "ci_jobs_total",
  help: "Total number of CI/CD jobs",
  labelNames: ["status"], // success, failed, timeout, cancelled
});

export const ciQueueDepth = new client.Gauge({
  name: "ci_queue_depth",
  help: "Number of jobs waiting in the CI queue",
});

// ── Storage Metrics ───────────────────────────────────────────────────────────
export const storageOperationDuration = new client.Histogram({
  name: "storage_operation_duration_seconds",
  help: "Duration of storage operations in seconds",
  labelNames: ["operation", "adapter"], // put, get, delete, stat
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
});

export const storageBytesTransferred = new client.Counter({
  name: "storage_bytes_transferred_total",
  help: "Total bytes transferred through storage",
  labelNames: ["direction"], // upload, download
});

// ── Cache Metrics ─────────────────────────────────────────────────────────────
export const cacheHits = new client.Counter({
  name: "cache_hits_total",
  help: "Total number of cache hits",
  labelNames: ["cache_name"],
});

export const cacheMisses = new client.Counter({
  name: "cache_misses_total",
  help: "Total number of cache misses",
  labelNames: ["cache_name"],
});

// ── SSE / WebSocket ───────────────────────────────────────────────────────────
export const sseConnections = new client.Gauge({
  name: "sse_active_connections",
  help: "Number of active Server-Sent Events connections",
});

// ── Auth Metrics ──────────────────────────────────────────────────────────────
export const authAttemptsTotal = new client.Counter({
  name: "auth_attempts_total",
  help: "Total authentication attempts",
  labelNames: ["method", "result"], // password/oauth/token, success/failure
});

export const rateLimitHits = new client.Counter({
  name: "rate_limit_hits_total",
  help: "Total number of rate limit rejections",
  labelNames: ["tier"], // api, auth
});

// ── Worker / Queue Metrics ────────────────────────────────────────────────────
export const mergeQueueDepth = new client.Gauge({
  name: "merge_queue_depth",
  help: "Number of items in the merge queue",
});

export const workerTaskDuration = new client.Histogram({
  name: "worker_task_duration_seconds",
  help: "Duration of worker background tasks",
  labelNames: ["task"], // queue_process, mirror_sync, cleanup
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
});

// ── Register all metrics ──────────────────────────────────────────────────────
const allMetrics = [
  httpRequestDurationMicroseconds,
  httpRequestsTotal,
  httpRequestsInFlight,
  dbQueryDuration,
  dbQueryErrors,
  dbConnectionPool,
  gitOperationDuration,
  gitCloneTotal,
  gitPushTotal,
  activeRunners,
  ciJobDuration,
  ciJobsTotal,
  ciQueueDepth,
  storageOperationDuration,
  storageBytesTransferred,
  cacheHits,
  cacheMisses,
  sseConnections,
  authAttemptsTotal,
  rateLimitHits,
  mergeQueueDepth,
  workerTaskDuration,
];

for (const metric of allMetrics) {
  register.registerMetric(metric);
}

export { register };
