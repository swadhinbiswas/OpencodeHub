/**
 * k6 Load Test — sustained load: 100 concurrent users
 * Target: P99 < 1s at 100 users
 * Run: k6 run tests/load/k6-load.js
 */
import { check, group, sleep } from "k6";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4321";

const slowRequests = new Counter("slow_requests");
const apiDuration = new Trend("api_request_duration", true);

export const options = {
  stages: [
    { duration: "1m", target: 50 }, // Ramp up to 50
    { duration: "3m", target: 100 }, // Ramp to 100
    { duration: "5m", target: 100 }, // Sustain 100
    { duration: "2m", target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<800", "p(99)<1000"],
    http_req_failed: ["rate<0.05"],
    slow_requests: ["count<100"],
  },
};

export default function () {
  group("Browse Repositories", () => {
    const res = http.get(`${BASE_URL}/explore`);
    check(res, { "explore 2xx": (r) => r.status < 400 });
    if (res.timings.duration > 1000) slowRequests.add(1);
    apiDuration.add(res.timings.duration);
    sleep(0.5);
  });

  group("API Health", () => {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, { "health ok": (r) => r.status === 200 });
    apiDuration.add(res.timings.duration);
    sleep(0.3);
  });

  group("Homepage", () => {
    const res = http.get(`${BASE_URL}/`);
    check(res, { "home 2xx": (r) => r.status < 400 });
    if (res.timings.duration > 1000) slowRequests.add(1);
    apiDuration.add(res.timings.duration);
    sleep(0.5);
  });

  group("Static Assets", () => {
    const res = http.get(`${BASE_URL}/favicon.svg`);
    check(res, { "favicon ok": (r) => r.status < 400 });
    sleep(0.2);
  });

  group("Sign-in Page", () => {
    const res = http.get(`${BASE_URL}/auth/login`);
    check(res, { "login page 2xx": (r) => r.status < 400 });
    apiDuration.add(res.timings.duration);
    sleep(0.5);
  });

  sleep(1);
}
