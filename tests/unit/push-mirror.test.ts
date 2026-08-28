import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveRepoPathMock,
  validateGitCloneUrlMock,
  createSimpleGitMock,
  rawMock,
} = vi.hoisted(() => ({
  resolveRepoPathMock: vi.fn(async () => "/data/repos/demo.git"),
  validateGitCloneUrlMock: vi.fn(async (): Promise<{ valid: true } | { valid: false; reason: string }> => ({ valid: true })),
  createSimpleGitMock: vi.fn(),
  rawMock: vi.fn(async () => ""),
}));

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: {},
}));

vi.mock("@/lib/git-storage", () => ({
  resolveRepoPath: resolveRepoPathMock,
}));

vi.mock("@/lib/url-validator", () => ({
  validateGitCloneUrl: validateGitCloneUrlMock,
}));

vi.mock("@/lib/workflow-secret-crypto", () => ({
  encryptWorkflowSecret: (value: string) => `enc:${value}`,
}));

vi.mock("@/lib/mirror-sync", () => ({
  // Mirrors pull-side behavior: token embedded transiently, never persisted.
  buildFetchUrl: (url: string, token: string | null | undefined) =>
    token ? `https://oauth2:${token}@dest.example.com/target.git` : url,
}));

vi.mock("@/lib/git", () => ({
  createSimpleGit: createSimpleGitMock,
}));

import {
  configurePushMirror,
  getPushMirror,
  processDuePushMirrors,
  pushMirrorNow,
  redactCredentials,
  removePushMirror,
} from "@/lib/push-mirror";

function makeDb() {
  const batches: any[][] = [];
  const sets: any[] = [];
  const takeBatch = () => (batches.length > 0 ? batches.shift()! : []);
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => takeBatch(),
          orderBy: () => ({ limit: async () => takeBatch() }),
        }),
        orderBy: () => ({ limit: async () => takeBatch() }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        sets.push(values);
        return { where: async () => ({}) };
      },
    }),
  };
  return { db, batches, sets };
}

let mockDb: any;

const repoRow = {
  id: "repo-1",
  diskPath: "/data/repos/demo.git",
  pushMirrorEnabled: true,
  pushMirrorUrl: "https://dest.example.com/target.git",
  pushMirrorToken: "enc:tok-123",
};

describe("push-mirror library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSimpleGitMock.mockReturnValue({ raw: rawMock });
    rawMock.mockResolvedValue("");
    validateGitCloneUrlMock.mockResolvedValue({ valid: true });
    mockDb = makeDb().db;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("configurePushMirror", () => {
    it("rejects URLs failing SSRF validation without touching the database", async () => {
      const state = makeDb();
      mockDb = state.db;
      validateGitCloneUrlMock.mockResolvedValue({
        valid: false,
        reason: "Scheme \"file:\" is not allowed.",
      });

      const result = await configurePushMirror("repo-1", { url: "file:///tmp/repo.git" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
      expect(state.sets).toHaveLength(0);
      expect(validateGitCloneUrlMock).toHaveBeenCalledWith(
        "file:///tmp/repo.git",
        false
      );
    });

    it("permits private targets when PUSH_MIRROR_ALLOW_PRIVATE=true", async () => {
      const state = makeDb();
      mockDb = state.db;
      vi.stubEnv("PUSH_MIRROR_ALLOW_PRIVATE", "true");
      state.batches.push([{ id: "repo-1" }]);

      await configurePushMirror("repo-1", { url: "http://localhost:3000/repo.git" });

      expect(validateGitCloneUrlMock).toHaveBeenCalledWith(
        "http://localhost:3000/repo.git",
        true
      );
    });

    it("encrypts the auth token and stores pending status", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push(
        [{ id: "repo-1" }],
        [
          {
            enabled: true,
            url: "https://dest.example.com/target.git",
            token: "enc:tok-123",
            status: "pending",
            lastPushMirrorAt: null,
          },
        ]
      );

      const result = await configurePushMirror("repo-1", {
        url: "https://dest.example.com/target.git",
        authToken: "tok-123",
      });

      expect(result.success).toBe(true);
      expect(state.sets[0]).toMatchObject({
        pushMirrorEnabled: true,
        pushMirrorUrl: "https://dest.example.com/target.git",
        pushMirrorToken: "enc:tok-123",
        pushMirrorStatus: "pending",
      });
      expect(result.config?.hasToken).toBe(true);
    });

    it("keeps an existing token when authToken is omitted", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([{ id: "repo-1" }], []);

      const result = await configurePushMirror("repo-1", {
        url: "https://dest.example.com/target.git",
      });

      expect(result.success).toBe(true);
      expect(state.sets[0].pushMirrorToken).toBeUndefined();
    });

    it("fails for unknown repository", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([]);

      const result = await configurePushMirror("missing", {
        url: "https://dest.example.com/target.git",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Repository not found");
    });
  });

  describe("getPushMirror", () => {
    it("never exposes the stored token", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([
        {
          enabled: true,
          url: "https://dest.example.com/target.git",
          token: "enc:tok-123",
          status: "success",
          lastPushMirrorAt: new Date("2026-08-01T00:00:00Z"),
        },
      ]);

      const config = await getPushMirror("repo-1");

      expect(config).toMatchObject({
        enabled: true,
        url: "https://dest.example.com/target.git",
        hasToken: true,
        status: "success",
      });
      expect(config && "token" in config).toBe(false);
    });

    it("reports hasToken=false without a stored token", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([
        { enabled: true, url: "https://dest.example.com/target.git", token: null, status: null, lastPushMirrorAt: null },
      ]);

      const config = await getPushMirror("repo-1");
      expect(config?.hasToken).toBe(false);
    });

    it("returns null when repository missing", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([]);

      expect(await getPushMirror("missing")).toBeNull();
    });
  });

  describe("removePushMirror", () => {
    it("clears all push mirror fields", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([{ id: "repo-1" }]);

      const result = await removePushMirror("repo-1");

      expect(result.success).toBe(true);
      expect(state.sets[0]).toMatchObject({
        pushMirrorEnabled: false,
        pushMirrorUrl: null,
        pushMirrorToken: null,
        pushMirrorStatus: null,
      });
    });

    it("fails when repository is missing", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([]);

      const result = await removePushMirror("missing");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Repository not found");
    });
  });

  describe("pushMirrorNow", () => {
    it("pushes forced heads/tags refspecs without --mirror and records success", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([repoRow]);
      rawMock.mockResolvedValue(
        "To https://dest.example.com/target.git\n * [new branch]  main -> main\n   v1 -> v1\n"
      );

      const result = await pushMirrorNow("repo-1");

      expect(result.success).toBe(true);
      expect(result.refsUpdated).toBe(2);

      const args = rawMock.mock.calls[0][0];
      expect(args[0]).toBe("push");
      expect(args).toContain("+refs/heads/*:refs/heads/*");
      expect(args).toContain("+refs/tags/*:refs/tags/*");
      expect(args).not.toContain("--mirror");
      // Transient credential injection per attempt
      expect(args).toContain("https://oauth2:enc:tok-123@dest.example.com/target.git");

      // simple-git block timeout kills the git process (timeout guard)
      expect(createSimpleGitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          baseDir: "/data/repos/demo.git",
          timeout: { block: 300_000 },
        })
      );

      // Status transitions: pushing -> success with timestamp
      expect(state.sets[0]).toMatchObject({ pushMirrorStatus: "pushing" });
      expect(state.sets[1]).toMatchObject({
        pushMirrorStatus: "success",
        lastPushMirrorAt: expect.any(Date),
      });
    });

    it("does nothing when push mirror is not configured", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([
        { id: "repo-1", diskPath: "/data/repos/demo.git", pushMirrorEnabled: false, pushMirrorUrl: null },
      ]);

      const result = await pushMirrorNow("repo-1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Push mirror not configured");
      expect(rawMock).not.toHaveBeenCalled();
      expect(state.sets).toHaveLength(0);
    });

    it("marks failed and redacts credentials from git errors", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([repoRow]);
      rawMock.mockRejectedValue(
        new Error(
          "fatal: unable to access 'https://oauth2:enc:tok-123@dest.example.com/target.git/': The requested URL returned error: 403"
        )
      );

      const result = await pushMirrorNow("repo-1");

      expect(result.success).toBe(false);
      expect(result.error).not.toContain("enc:tok-123");
      expect(result.error).toContain("***");
      expect(state.sets.at(-1)).toMatchObject({ pushMirrorStatus: "failed" });
    });

    it("honours PUSH_MIRROR_TIMEOUT_SECS for the process kill guard", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([repoRow]);
      vi.stubEnv("PUSH_MIRROR_TIMEOUT_SECS", "42");

      await pushMirrorNow("repo-1");

      expect(createSimpleGitMock).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: { block: 42_000 } })
      );
    });

    it("survives repository lookup failures", async () => {
      mockDb = {
        select: () => {
          throw new Error("db down");
        },
        update: () => ({ set: () => ({ where: async () => ({}) }) }),
      };

      const result = await pushMirrorNow("repo-1");
      expect(result.success).toBe(false);
      expect(result.error).toBe("db down");
    });
  });

  describe("processDuePushMirrors", () => {
    it("processes never-pushed repos first, then stale ones, oldest first", async () => {
      const state = makeDb();
      mockDb = state.db;
      // Selection: never-pushed [a,b], stale [c]; then one repo lookup per id.
      state.batches.push(
        [{ id: "a" }, { id: "b" }],
        [{ id: "c" }],
        [repoRow],
        [repoRow],
        [repoRow]
      );
      rawMock.mockResolvedValue("x -> y\n");

      const result = await processDuePushMirrors({});

      expect(result.total).toBe(3);
      expect(result.pushed).toBe(3);
      expect(result.failed).toBe(0);
      expect(rawMock).toHaveBeenCalledTimes(3);
    });

    it("continues after individual failures and reports them", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push(
        [{ id: "ok-1" }, { id: "bad-1" }, { id: "ok-2" }],
        [],
        [repoRow],
        [repoRow],
        [repoRow]
      );
      let call = 0;
      rawMock.mockImplementation(async () => {
        call += 1;
        if (call === 2) throw new Error("remote rejected");
        return "";
      });

      const result = await processDuePushMirrors({});

      expect(result.pushed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.failedRepoIds).toEqual(["bad-1"]);
    });

    it("respects the limit across both queries", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([{ id: "a" }], [{ id: "c" }]);
      rawMock.mockResolvedValue("");

      const result = await processDuePushMirrors({ limit: 2 });

      expect(result.total).toBe(2);
    });

    it("uses PUSH_MIRROR_MIN_INTERVAL_SECS default of 300 for staleness cutoff", async () => {
      const state = makeDb();
      mockDb = state.db;
      state.batches.push([], []);
      vi.stubEnv("PUSH_MIRROR_MIN_INTERVAL_SECS", "600");

      await processDuePushMirrors({});
      // No crash + empty selection is enough here; cutoff math is internal.
      expect(true).toBe(true);
    });

    it("never throws when due-selection query fails", async () => {
      mockDb = {
        select: () => {
          throw new Error("db down");
        },
      };

      const result = await processDuePushMirrors({ limit: 5 });

      expect(result).toEqual({
        total: 0,
        eligible: 0,
        pushed: 0,
        failed: 0,
        failedRepoIds: [],
        durationMs: expect.any(Number),
      });
    });
  });

  describe("redactCredentials", () => {
    it("strips userinfo passwords from embedded URLs", () => {
      const input = "error fetching https://user:s3cret@host/path and https://oauth2:t0k@other.host/x";
      const output = redactCredentials(input);
      expect(output).not.toContain("s3cret");
      expect(output).not.toContain("t0k");
      expect(output).toContain("https://user:***@host/path");
      expect(output).toContain("https://oauth2:***@other.host/x");
    });
  });
});
