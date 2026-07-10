import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  distributedLocking: true,
  distributedRateLimit: true,
  queueMultiInstanceSafe: true,
}));

const rawQueryMock = vi.hoisted(() => vi.fn(async () => [{ "?column?": 1 }]));
const fsAccessMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/db/adapter", () => ({
  getDb: () => ({
    rawQuery: rawQueryMock,
  }),
}));

vi.mock("@/lib/distributed-lock", () => ({
  get isDistributedLocking() {
    return state.distributedLocking;
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  get isDistributed() {
    return state.distributedRateLimit;
  },
}));

vi.mock("@/lib/queue-worker", () => ({
  getQueueWorkerScalingReadiness: () => ({
    inProcessGuardEnabled: true,
    distributedLockingEnabled: state.distributedLocking,
    multiInstanceSafe: state.queueMultiInstanceSafe,
  }),
}));

vi.mock("fs/promises", () => ({
  access: fsAccessMock,
}));

import { GET as healthGet } from "@/pages/api/health";

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("health route scaling diagnostics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    state.distributedLocking = true;
    state.distributedRateLimit = true;
    state.queueMultiInstanceSafe = true;
  });

  it("returns healthy scaling diagnostics when distributed systems are active", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const response = await healthGet({} as any);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body?.checks?.scaling?.status).toBe("ok");
    expect(body?.checks?.scaling?.details?.distributedLocking).toBe(true);
    expect(body?.checks?.scaling?.details?.distributedRateLimit).toBe(true);
  });

  it("returns unhealthy when production scaling requirements are not met", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    state.distributedLocking = false;
    state.distributedRateLimit = false;
    state.queueMultiInstanceSafe = false;

    const response = await healthGet({} as any);
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body?.checks?.scaling?.status).toBe("error");
    expect(String(body?.checks?.scaling?.message || "")).toContain("REDIS_URL is required");
  });
});
