import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const runDueDigestsMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock("@/lib/chat-notifications", () => ({
  runDueDigests: runDueDigestsMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}));

describe("notification digest cron API", () => {
  beforeEach(() => {
    runDueDigestsMock.mockReset();
    loggerInfoMock.mockReset();
    loggerErrorMock.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.resetModules();
    const mod = await import("@/pages/api/cron/notification-digests");

    const request = new Request("http://localhost/api/cron/notification-digests", {
      method: "POST",
      headers: { Authorization: "Bearer anything" },
    });

    const response = await mod.POST({ request, url: new URL(request.url) } as any);
    expect(response.status).toBe(401);
    expect(runDueDigestsMock).not.toHaveBeenCalled();
  });

  it("returns 401 when token is invalid", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret");
    vi.resetModules();
    const mod = await import("@/pages/api/cron/notification-digests");

    const request = new Request("http://localhost/api/cron/notification-digests", {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });

    const response = await mod.POST({ request, url: new URL(request.url) } as any);
    expect(response.status).toBe(401);
    expect(runDueDigestsMock).not.toHaveBeenCalled();
  });

  it("passes dryRun=true to digest runner", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret");
    runDueDigestsMock.mockResolvedValue({
      checked: 4,
      due: 2,
      sent: 2,
      skippedNoEmail: 0,
      skippedEmpty: 0,
      failed: 0,
    });
    vi.resetModules();
    const mod = await import("@/pages/api/cron/notification-digests");

    const request = new Request("http://localhost/api/cron/notification-digests?dryRun=true", {
      method: "POST",
      headers: { Authorization: "Bearer super-secret" },
    });

    const response = await mod.POST({ request, url: new URL(request.url) } as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.maxRetries).toBe(1);
    expect(runDueDigestsMock).toHaveBeenCalledWith({ dryRun: true, maxRetries: 1 });
    expect(loggerInfoMock).toHaveBeenCalledTimes(1);
  });

  it("passes maxRetries query param to digest runner", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret");
    runDueDigestsMock.mockResolvedValue({
      checked: 1,
      due: 1,
      sent: 1,
      skippedNoEmail: 0,
      skippedEmpty: 0,
      failed: 0,
      retried: 1,
      recovered: 1,
    });
    vi.resetModules();
    const mod = await import("@/pages/api/cron/notification-digests");

    const request = new Request("http://localhost/api/cron/notification-digests?maxRetries=3", {
      method: "POST",
      headers: { Authorization: "Bearer super-secret" },
    });

    const response = await mod.POST({ request, url: new URL(request.url) } as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.maxRetries).toBe(3);
    expect(runDueDigestsMock).toHaveBeenCalledWith({ dryRun: false, maxRetries: 3 });
  });

  it("returns 500 when digest runner throws", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret");
    runDueDigestsMock.mockRejectedValue(new Error("boom"));
    vi.resetModules();
    const mod = await import("@/pages/api/cron/notification-digests");

    const request = new Request("http://localhost/api/cron/notification-digests", {
      method: "POST",
      headers: { Authorization: "Bearer super-secret" },
    });

    const response = await mod.POST({ request, url: new URL(request.url) } as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("boom");
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });
});
