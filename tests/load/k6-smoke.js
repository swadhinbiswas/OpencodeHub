/**
 * k6 Smoke Test — basic sanity check under minimal load
 * Run: k6 run tests/load/k6-smoke.js
 */
import { check, sleep } from "k6";
import http from "k6/http";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4321";

export const options = {
  stages: [
    { duration: "30s", target: 5 },
    { duration: "1m", target: 5 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  // 1. Homepage
  const homeRes = http.get(`${BASE_URL}/`);
  check(homeRes, {
    "homepage status 200": (r) => r.status === 200,
    "homepage time < 500ms": (r) => r.timings.duration < 500,
  });

  sleep(1);

  // 2. Health endpoint
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    "health status 200": (r) => r.status === 200,
  });

  sleep(0.5);

  // 3. Explore/public repos
  const exploreRes = http.get(`${BASE_URL}/explore`);
  check(exploreRes, {
    "explore status 200": (r) => r.status === 200,
  });

  sleep(1);
}
