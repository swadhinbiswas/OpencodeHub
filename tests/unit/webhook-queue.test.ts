/**
 * Unit: Webhook delivery queue (src/lib/webhooks.ts)
 *
 * Contract after queue decoupling:
 * - triggerWebhooks only ENQUEUES pending delivery rows (no HTTP dispatch).
 * - deliverWebhookDelivery performs exactly one attempt and transitions the
 *   row: delivered / pending-with-backoff / dead.
 * - Retries follow the 1s→16s exponential backoff schedule and die after
 *   WEBHOOK_MAX_RETRIES retries (+initial attempt).
 * - 4xx responses are non-retryable and dead-letter immediately.
 * - processWebhookQueue claims rows atomically (FOR UPDATE SKIP LOCKED) and
 *   requeues locks stuck beyond STALE_WEBHOOK_LOCK_SECS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { validateWebhookUrlMock, isOfflineModeMock } = vi.hoisted(() => ({
  validateWebhookUrlMock: vi.fn(async (): Promise<{ valid: boolean; reason?: string }> => ({ valid: true })),
  isOfflineModeMock: vi.fn(() => false),
}));

vi.mock("@/db", () => ({
  getDatabase: () => mockDb.db,
  schema: {
    webhooks: { deliveryCount: "__col_delivery_count__" },
    webhookDeliveries: {},
  },
}));

vi.mock("@/lib/url-validator", () => ({
  validateWebhookUrl: validateWebhookUrlMock,
}));

vi.mock("@/lib/config", () => ({
  isOfflineMode: isOfflineModeMock,
}));

import { schema } from "@/db";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  deliverWebhookDelivery,
  processWebhookQueue,
  reclaimStaleLocks,
  triggerWebhooks,
} from "@/lib/webhooks";

const WEBHOOKS_TABLE = Symbol("webhooks");
const DELIVERIES_TABLE = Symbol("webhookDeliveries");
// The mocked schema above hands the lib marker objects; mirror their identity
// so the fake db can tell updates apart.
(schema as any).webhooks = { ...(schema as any).webhooks, __table: WEBHOOKS_TABLE };
(schema as any).webhookDeliveries = { __table: DELIVERIES_TABLE };

interface UpdateRecord {
  table: symbol;
  values: Record<string, any>;
}

function makeDb(options: {
  hooks?: any[];
  /** FIFO results served by webhookDeliveries.findFirst */
  deliveries?: any[];
  /** ids returned by the atomic claim statement */
  claimIds?: string[];
  /** ids returned by the stale-sweep .returning() */
  reclaimedIds?: string[];
} = {}) {
  const state = {
    insertedDeliveries: [] as any[],
    deliveryUpdates: [] as UpdateRecord[],
    webhookUpdates: [] as UpdateRecord[],
    claimStatements: [] as string[],
  };

  function recordUpdate(table: any, values: Record<string, any>) {
    const record = { table, values };
    if (table === (schema as any).webhookDeliveries) state.deliveryUpdates.push(record);
    else if (table === (schema as any).webhooks) state.webhookUpdates.push(record);
    return record;
  }

  const db = {
    query: {
      webhooks: {
        findMany: async () => options.hooks ?? [],
        findFirst: async () => options.hooks?.[0] ?? null,
      },
      webhookDeliveries: {
        findFirst: async () => {
          const next = options.deliveries?.shift();
          if (next instanceof Error) throw next; // simulate a worker crash
          return next ?? null;
        },
      },
    },
    insert: (_table: any) => ({
      values: async (rows: any) => {
        for (const row of Array.isArray(rows) ? rows : [rows]) {
          state.insertedDeliveries.push(row);
        }
        return {};
      },
    }),
    update: (table: any) => ({
      set: (values: Record<string, any>) => ({
        where: () => {
          const record = recordUpdate(table, values);
          return {
            returning: async () => {
              if (table === (schema as any).webhookDeliveries && values.lockedAt === null && values.status === "pending") {
                return (options.reclaimedIds ?? []).map((id) => ({ id }));
              }
              return [];
            },
            then: (resolve: (v: any) => void, reject: (e: any) => void) =>
              Promise.resolve({}).then(() => resolve({}), reject),
          } as any;
        },
      }),
    }),
    execute: async (query: any) => {
      state.claimStatements.push(new PgDialect().sqlToQuery(query).sql);
      return { rows: (options.claimIds ?? []).map((id) => ({ id })) };
    },
  };

  void recordUpdate;
  return { db, state };
}

let mockDb: ReturnType<typeof makeDb>;

const hookRow = {
  id: "hook-1",
  repositoryId: "repo-1",
  url: "https://receiver.example.com/hook",
  secret: "topsecret",
  events: ["push"],
  active: true,
};

const starHookRow = {
  ...hookRow,
  id: "hook-star",
  events: ["*"],
};

const otherHookRow = {
  ...hookRow,
  id: "hook-other",
  events: ["issues"],
};

function pendingDelivery(overrides: Partial<any> = {}) {
  return {
    id: "delivery-1",
    webhookId: "hook-1",
    event: "push",
    payload: JSON.stringify({ ref: "refs/heads/main" }),
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(Date.now() - 1000),
    lockedAt: null,
    failureReason: null,
    responseCode: null,
    responseBody: null,
    durationMs: null,
    error: null,
    requestHeaders: null,
    responseHeaders: null,
    ...overrides,
  };
}

function stubFetch(status: number, body = "") {
  const fetchMock = vi.fn(async () =>
    new Response(body, { status, headers: { "x-reply": "yes" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  mockDb = makeDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("triggerWebhooks (enqueue-only)", () => {
  it("enqueues one pending delivery per matching hook and performs no HTTP dispatch", async () => {
    const fetchMock = stubFetch(200);
    mockDb = makeDb({ hooks: [hookRow, starHookRow, otherHookRow] });

    const enqueued = await triggerWebhooks("repo-1", "push", { after: "abc" });

    expect(enqueued).toBe(2); // push-subscriber + wildcard; 'issues'-only hook excluded
    expect(mockDb.state.insertedDeliveries).toHaveLength(2);

    for (const row of mockDb.state.insertedDeliveries) {
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(0);
      expect(row.event).toBe("push");
      expect(row.nextAttemptAt).toBeInstanceOf(Date);
      expect(row.webhookId).not.toBe("hook-other");
      expect(JSON.parse(row.payload)).toEqual({ after: "abc" });
      expect(row.id).toBeTruthy();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 0 and inserts nothing when no hooks subscribe to the event", async () => {
    mockDb = makeDb({ hooks: [otherHookRow] });
    const enqueued = await triggerWebhooks("repo-1", "push", {});
    expect(enqueued).toBe(0);
    expect(mockDb.state.insertedDeliveries).toHaveLength(0);
  });
});

describe("deliverWebhookDelivery", () => {
  it("marks the row delivered on 2xx, records response fields and bumps stats", async () => {
    const fetchMock = stubFetch(200, "ok");
    mockDb = makeDb({
      hooks: [hookRow],
      deliveries: [pendingDelivery()],
    });

    const outcome = await deliverWebhookDelivery("delivery-1");

    expect(outcome).toBe("delivered");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const update = mockDb.state.deliveryUpdates[0];
    expect(update.values.status).toBe("delivered");
    expect(update.values.attempts).toBe(1);
    expect(update.values.responseCode).toBe(200);
    expect(update.values.responseBody).toBe("ok");
    expect(update.values.error).toBeNull();
    expect(update.values.lockedAt).toBeNull();

    const headers = JSON.parse(update.values.requestHeaders);
    expect(headers["X-Hub-Signature-256"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(headers["X-OpenCodeHub-Delivery"]).toBe("delivery-1");
    expect(headers["X-OpenCodeHub-Event"]).toBe("push");

    const stats = mockDb.state.webhookUpdates[0];
    expect(stats.values.lastDeliveryStatus).toBe("success");
    expect(stats.values.lastDeliveryAt).toBeInstanceOf(Date);
    // Atomic COALESCE increment referencing the deliveryCount column
    expect(JSON.stringify(stats.values.deliveryCount)).toContain(
      "__col_delivery_count__",
    );
  });

  it("signs with X-Hub-Signature-256 only when a secret is configured", async () => {
    stubFetch(200);
    mockDb = makeDb({
      hooks: [{ ...hookRow, secret: null }],
      deliveries: [pendingDelivery()],
    });

    await deliverWebhookDelivery("delivery-1");

    const headers = JSON.parse(mockDb.state.deliveryUpdates[0].values.requestHeaders);
    expect(headers["X-Hub-Signature-256"]).toBeUndefined();
  });

  it("retries failures with exponential backoff, then dies after max attempts", async () => {
    vi.stubEnv("WEBHOOK_MAX_RETRIES", "1"); // total attempts = 2
    const fetchMock = stubFetch(500);
    const delivery = pendingDelivery();
    mockDb = makeDb({ hooks: [hookRow], deliveries: [delivery] });

    const first = await deliverWebhookDelivery("delivery-1");
    expect(first).toBe("retrying");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const retryValues = mockDb.state.deliveryUpdates[0].values;
    expect(retryValues.status).toBe("pending");
    expect(retryValues.attempts).toBe(1);
    expect(retryValues.lockedAt).toBeNull();
    expect(retryValues.failureReason).toBeNull();
    const delay = retryValues.nextAttemptAt.getTime() - Date.now();
    expect(delay).toBeGreaterThanOrEqual(900); // 1s backoff after 1st failure
    expect(delay).toBeLessThanOrEqual(2500);
    expect(retryValues.error).toContain("HTTP 500");

    // Second (final allowed) attempt fails → dead letter with reason
    mockDb = makeDb({
      hooks: [hookRow],
      deliveries: [pendingDelivery({ attempts: 1 })],
    });
    const second = await deliverWebhookDelivery("delivery-1");

    expect(second).toBe("dead");
    const deadValues = mockDb.state.deliveryUpdates[0].values;
    expect(deadValues.status).toBe("dead");
    expect(deadValues.attempts).toBe(2);
    expect(deadValues.failureReason).toBe("Failed after 2/2 attempts");
    expect(deadValues.lockedAt).toBeNull();
  });

  it("dead-letters 4xx responses immediately (non-retryable)", async () => {
    const fetchMock = stubFetch(422);
    mockDb = makeDb({
      hooks: [hookRow],
      deliveries: [pendingDelivery()],
    });

    const outcome = await deliverWebhookDelivery("delivery-1");

    expect(outcome).toBe("dead");
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry scheduled
    const deadValues = mockDb.state.deliveryUpdates[0].values;
    expect(deadValues.status).toBe("dead");
    expect(deadValues.attempts).toBe(1);
    expect(deadValues.failureReason).toContain("Not retryable");
    expect(deadValues.failureReason).toContain("422");
    expect(deadValues.responseCode).toBe(422);
    expect(deadValues.nextAttemptAt).toBeUndefined(); // no reschedule
  });

  it("dead-letters rows whose webhook was deleted", async () => {
    stubFetch(200);
    mockDb = makeDb({ hooks: [], deliveries: [pendingDelivery()] });

    const outcome = await deliverWebhookDelivery("delivery-1");

    expect(outcome).toBe("dead");
    expect(mockDb.state.deliveryUpdates[0].values.failureReason).toContain("no longer exist");
  });

  it("skips terminal rows without touching them", async () => {
    stubFetch(200);
    mockDb = makeDb({
      hooks: [hookRow],
      deliveries: [pendingDelivery({ status: "delivered" })],
    });

    const outcome = await deliverWebhookDelivery("delivery-1");

    expect(outcome).toBe("skipped");
    expect(mockDb.state.deliveryUpdates).toHaveLength(0);
    expect(mockDb.state.webhookUpdates).toHaveLength(0);
  });
});

describe("processWebhookQueue", () => {
  it("claims due rows atomically with FOR UPDATE SKIP LOCKED and delivers them", async () => {
    stubFetch(200);
    mockDb = makeDb({
      hooks: [hookRow],
      deliveries: [pendingDelivery({ id: "d1" }), pendingDelivery({ id: "d2" })],
      claimIds: ["d1", "d2"],
    });

    const result = await processWebhookQueue(20);

    expect(result.claimed).toBe(2);
    expect(result.delivered).toBe(2);
    expect(result.dead).toBe(0);
    expect(mockDb.state.claimStatements).toHaveLength(1);
    expect(mockDb.state.claimStatements[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(mockDb.state.claimStatements[0]).toContain("status = 'pending'");
    expect(mockDb.state.claimStatements[0]).toContain("next_attempt_at <= now()");
    const deliveredUpdates = mockDb.state.deliveryUpdates.filter(
      (u) => u.values.status === "delivered",
    );
    expect(deliveredUpdates).toHaveLength(2);
    // The sweep ran first and requeued nothing (no reclaimedIds configured)
    expect(mockDb.state.deliveryUpdates[0].values.status).toBe("pending");
    expect(mockDb.state.deliveryUpdates[0].values.lockedAt).toBeNull();
  });

  it("keeps delivering remaining claimed rows when one delivery crashes", async () => {
    const fetchMock = stubFetch(200);
    mockDb = makeDb({
      hooks: [hookRow],
      deliveries: [
        new Error("simulated worker crash"), // d-crash: findFirst explodes → caught by queue loop
        pendingDelivery({ id: "d-ok" }),
      ],
      claimIds: ["d-crash", "d-ok"],
    });

    const result = await processWebhookQueue(10);

    // The crashed row is not counted anywhere — it stays 'processing' until
    // the stale-lock sweep requeues it; the healthy row still gets delivered.
    expect(result.claimed).toBe(2);
    expect(result.delivered).toBe(1);
    expect(result.dead).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requeues stale processing locks before claiming", async () => {
    stubFetch(200);
    mockDb = makeDb({
      hooks: [hookRow],
      deliveries: [pendingDelivery()],
      claimIds: ["delivery-1"],
      reclaimedIds: ["stale-1", "stale-2"],
    });

    const swept = await reclaimStaleLocks();

    expect(swept).toBe(2);
    expect(mockDb.state.deliveryUpdates).toHaveLength(1);
    expect(mockDb.state.deliveryUpdates[0].values.status).toBe("pending");
    expect(mockDb.state.deliveryUpdates[0].values.lockedAt).toBeNull();
  });
});
