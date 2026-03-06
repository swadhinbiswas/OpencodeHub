/**
 * k6 Spike Test — sudden traffic burst
 * Simulates viral event or DDoS-like burst
 * Run: k6 run tests/load/k6-spike.js
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4321";

const serverErrors = new Counter("server_errors_5xx");

export const options = {
  stages: [
    { duration: "30s", target: 10 }, // Warm up
    { duration: "30s", target: 500 }, // SPIKE!
    { duration: "1m", target: 500 }, // Sustain spike
    { duration: "30s", target: 10 }, // Cool down
    { duration: "1m", target: 10 }, // Recovery
    { duration: "30s", target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<3000"],
    http_req_failed: ["rate<0.15"], // Expect some failures during spike
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/`);
  check(res, {
    "status ok": (r) => r.status < 500,
    "not timeout": (r) => r.timings.duration < 10000,
  });
  if (res.status >= 500) serverErrors.add(1);
  sleep(0.5);

  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, { "health alive": (r) => r.status === 200 });
  sleep(0.5);
}
