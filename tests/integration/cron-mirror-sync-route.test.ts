import { beforeEach, describe, expect, it, vi } from "vitest";

const { syncAllMirrorsScheduledMock } = vi.hoisted(() => ({
  syncAllMirrorsScheduledMock: vi.fn(async () => ({
    synced: 2,
    failed: 1,
    total: 5,
    eligible: 3,
    skipped: 2,
    stale: 4,
    failedRepoIds: ["repo-failed-1"],
    durationMs: 123,
  })),
}));

vi.mock("@/lib/mirror-sync", () => ({
  syncAllMirrorsScheduled: syncAllMirrorsScheduledMock,
}));

describe("cron mirror sync route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });

  it("rejects requests with invalid cron secret", async () => {
    const { POST: mirrorCronPost } = await import("@/pages/api/cron/mirror-sync");
    const response = await mirrorCronPost({
      request: new Request("http://localhost/api/cron/mirror-sync", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-secret" },
      }),
    } as any);

    expect(response.status).toBe(401);
    expect(syncAllMirrorsScheduledMock).not.toHaveBeenCalled();
  });

  it("runs scheduled sync with query options and returns monitoring metrics", async () => {
    const { POST: mirrorCronPost } = await import("@/pages/api/cron/mirror-sync");
    const response = await mirrorCronPost({
      request: new Request(
        "http://localhost/api/cron/mirror-sync?staleOnly=false&minSyncIntervalMinutes=15&maxRepos=10&staleAfterMinutes=60",
        {
          method: "POST",
          headers: { Authorization: "Bearer cron-secret" },
        }
      ),
    } as any);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.synced).toBe(2);
    expect(body?.eligible).toBe(3);
    expect(body?.failedRepoIds).toEqual(["repo-failed-1"]);
    expect(syncAllMirrorsScheduledMock).toHaveBeenCalledWith({
      staleOnly: false,
      minSyncIntervalMinutes: 15,
      maxRepos: 10,
      staleAfterMinutes: 60,
    });
  });

  it("supports GET requests", async () => {
    const { GET: mirrorCronGet } = await import("@/pages/api/cron/mirror-sync");
    const response = await mirrorCronGet({
      request: new Request("http://localhost/api/cron/mirror-sync", {
        method: "GET",
        headers: { Authorization: "Bearer cron-secret" },
      }),
    } as any);

    expect(response.status).toBe(200);
  });

  it("falls back to safe defaults for invalid query options", async () => {
    const { POST: mirrorCronPost } = await import("@/pages/api/cron/mirror-sync");
    const response = await mirrorCronPost({
      request: new Request(
        "http://localhost/api/cron/mirror-sync?staleOnly=invalid&minSyncIntervalMinutes=-5&maxRepos=0&staleAfterMinutes=abc",
        {
          method: "POST",
          headers: { Authorization: "Bearer cron-secret" },
        }
      ),
    } as any);

    expect(response.status).toBe(200);
    expect(syncAllMirrorsScheduledMock).toHaveBeenCalledWith({
      staleOnly: true,
      minSyncIntervalMinutes: undefined,
      maxRepos: undefined,
      staleAfterMinutes: undefined,
    });
  });
});
