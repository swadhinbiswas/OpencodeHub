/**
 * k6 Stress Test — push beyond limits: 500 concurrent users
 * Target: P99 < 3s at 500 users, graceful degradation
 * Run: k6 run tests/load/k6-stress.js
 */
import { check, group, sleep } from "k6";
import http from "k6/http";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4321";

const serverErrors = new Counter("server_errors_5xx");

export const options = {
  stages: [
    { duration: "2m", target: 100 },
    { duration: "3m", target: 250 },
    { duration: "3m", target: 500 },
    { duration: "5m", target: 500 }, // Sustain peak
    { duration: "2m", target: 100 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000", "p(99)<3000"],
    http_req_failed: ["rate<0.10"],
    server_errors_5xx: ["count<50"],
  },
};

export default function () {
  group("Browse", () => {
    const res = http.get(`${BASE_URL}/explore`);
    check(res, { "explore 2xx": (r) => r.status < 400 });
    if (res.status >= 500) serverErrors.add(1);
    sleep(0.5);
  });

  group("API Health", () => {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, { "health ok": (r) => r.status === 200 });
    if (res.status >= 500) serverErrors.add(1);
    sleep(0.3);
  });

  group("Homepage", () => {
    const res = http.get(`${BASE_URL}/`);
    check(res, { "home ok": (r) => r.status < 400 });
    if (res.status >= 500) serverErrors.add(1);
    sleep(0.5);
  });

  group("Login Page", () => {
    const res = http.get(`${BASE_URL}/auth/login`);
    check(res, { "login 2xx": (r) => r.status < 400 });
    if (res.status >= 500) serverErrors.add(1);
    sleep(0.5);
  });

  sleep(1);
}
