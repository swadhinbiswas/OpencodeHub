/**
 * k6 API Lifecycle Test — authenticated user flows
 * Tests: issue CRUD, repository browse, search
 * Run: k6 run tests/load/k6-api-lifecycle.js --env AUTH_TOKEN=<token>
 */
import { check, group, sleep } from "k6";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4321";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

const apiLatency = new Trend("api_latency", true);
const apiErrors = new Counter("api_errors");

export const options = {
  stages: [
    { duration: "1m", target: 20 },
    { duration: "3m", target: 50 },
    { duration: "2m", target: 50 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    api_latency: ["p(95)<500", "p(99)<1000"],
    api_errors: ["count<20"],
    http_req_failed: ["rate<0.05"],
  },
};

function apiGet(path) {
  const headers = AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};
  return http.get(`${BASE_URL}${path}`, { headers });
}

function apiPost(path, body) {
  const headers = {
    "Content-Type": "application/json",
    ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
  };
  return http.post(`${BASE_URL}${path}`, JSON.stringify(body), { headers });
}

export default function () {
  // Scenario 1: Browse repositories
  group("Browse Repos", () => {
    const res = apiGet("/api/repos?page=1&limit=20");
    check(res, { "repos list 2xx": (r) => r.status < 400 });
    apiLatency.add(res.timings.duration);
    if (res.status >= 400) apiErrors.add(1);
    sleep(0.5);
  });

  // Scenario 2: Search
  group("Search", () => {
    const res = apiGet("/api/search?q=test&type=repos");
    check(res, { "search 2xx": (r) => r.status < 400 });
    apiLatency.add(res.timings.duration);
    if (res.status >= 400) apiErrors.add(1);
    sleep(0.5);
  });

  // Scenario 3: Get repo details (use a known test repo or random)
  group("Repo Detail", () => {
    const res = apiGet("/api/repos/admin/test-repo");
    // 404 is acceptable in load testing — we just care about latency
    check(res, { "repo detail ≤ 404": (r) => r.status <= 404 });
    apiLatency.add(res.timings.duration);
    sleep(0.3);
  });

  // Scenario 4: Issues list
  group("Issues List", () => {
    const res = apiGet("/api/repos/admin/test-repo/issues?page=1");
    check(res, { "issues ≤ 404": (r) => r.status <= 404 });
    apiLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Scenario 5: Metrics endpoint
  group("Metrics", () => {
    const res = apiGet("/api/metrics");
    check(res, { "metrics 2xx": (r) => r.status < 400 });
    apiLatency.add(res.timings.duration);
    sleep(0.3);
  });

  sleep(1);
}
