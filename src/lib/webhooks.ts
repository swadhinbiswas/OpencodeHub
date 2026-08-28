/**
 * Webhook Dispatch Service — DB-backed delivery queue
 *
 * triggerWebhooks() only ENQUEUES one webhook_deliveries row per matching
 * hook (status 'pending'); the background worker drains the queue via
 * processWebhookQueue(), which claims rows atomically (FOR UPDATE SKIP
 * LOCKED), delivers them reusing the shared HMAC/SSRF/timeout paths, and
 * reschedules failures with exponential backoff until they succeed or die.
 */

import { getDatabase, schema } from "@/db";
import crypto from "crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "./logger";
import { validateWebhookUrl } from "./url-validator";
import { generateId } from "./utils";

interface WebhookPayload {
  [key: string]: any;
}

type WebhookRow = typeof schema.webhooks.$inferSelect;

/** Total delivery attempts per queued row = WEBHOOK_MAX_RETRIES retries + initial attempt. */
function maxAttempts(): number {
  return Math.max(1, parseInt(process.env.WEBHOOK_MAX_RETRIES || "4", 10)) + 1;
}

/** Delay before the next attempt after `completedAttempts` failed tries: 1s→16s cap. */
function backoffDelay(completedAttempts: number): number {
  return Math.min(1000 * 2 ** (completedAttempts - 1), 16_000);
}

/**
 * Trigger webhooks for a specific repository and event.
 * Enqueues one pending delivery per matching hook and returns the count.
 * Actual HTTP delivery happens asynchronously in the background worker
 * (scripts/worker.ts → processWebhookQueue).
 */
export async function triggerWebhooks(
  repositoryId: string,
  event: string,
  payload: WebhookPayload,
): Promise<number> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Find active webhooks for this repo
  const webhooks = await db.query.webhooks.findMany({
    where: and(
      eq(schema.webhooks.repositoryId, repositoryId),
      eq(schema.webhooks.active, true),
    ),
  });

  // Filter webhooks that subscribe to this event
  const matchingWebhooks = webhooks.filter((hook) => {
    let events: string[] = [];
    try {
      events = Array.isArray(hook.events)
        ? hook.events
        : JSON.parse(String(hook.events));
    } catch {
      logger.warn(
        { webhookId: hook.id },
        "Skipping webhook with invalid events config",
      );
      return false;
    }
    return events.includes(event) || events.includes("*");
  });

  if (matchingWebhooks.length === 0) return 0;

  await db.insert(schema.webhookDeliveries).values(
    matchingWebhooks.map((hook) => ({
      id: generateId(),
      webhookId: hook.id,
      event,
      payload: JSON.stringify(payload),
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
    })),
  );

  logger.info(
    { repositoryId, event, enqueued: matchingWebhooks.length },
    "Enqueued webhooks for delivery",
  );

  return matchingWebhooks.length;
}

// ── Queue processing ─────────────────────────────────────────────────────────

export interface WebhookQueueResult {
  swept: number;
  claimed: number;
  delivered: number;
  retried: number;
  dead: number;
}

/**
 * Drain the webhook delivery queue.
 * 1. Re-queue deliveries stuck in 'processing' beyond STALE_WEBHOOK_LOCK_SECS.
 * 2. Atomically claim up to `limit` due pending rows (multi-instance safe).
 * 3. Deliver each claimed row sequentially.
 */
export async function processWebhookQueue(
  limit = 20,
): Promise<WebhookQueueResult> {
  const swept = await reclaimStaleLocks();
  const ids = await claimPendingDeliveries(limit);

  const result: WebhookQueueResult = {
    swept,
    claimed: ids.length,
    delivered: 0,
    retried: 0,
    dead: 0,
  };

  for (const id of ids) {
    try {
      const outcome = await deliverWebhookDelivery(id);
      if (outcome === "delivered") result.delivered++;
      else if (outcome === "retrying") result.retried++;
      else if (outcome === "dead") result.dead++;
    } catch (error) {
      // Leave the row as 'processing' — the stale-lock sweep will re-queue it.
      logger.error(
        { err: error, deliveryId: id },
        "Webhook delivery crashed — row left for stale-lock reclaim",
      );
    }
  }

  return result;
}

/**
 * Claim up to `limit` due pending deliveries by flipping them to 'processing'
 * in a single atomic statement. FOR UPDATE SKIP LOCKED keeps concurrent
 * workers from claiming the same row.
 */
async function claimPendingDeliveries(limit: number): Promise<string[]> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const claimed = await db.execute(sql`
    UPDATE webhook_deliveries
    SET status = 'processing', locked_at = now()
    WHERE id IN (
      SELECT id FROM webhook_deliveries
      WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  return (claimed.rows ?? []).map((row) => String(row.id));
}

/**
 * Re-queue deliveries whose worker died mid-flight ('processing' with a lock
 * older than STALE_WEBHOOK_LOCK_SECS, default 300s). Returns the count.
 */
export async function reclaimStaleLocks(): Promise<number> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const staleSecs = Math.max(
    1,
    parseInt(process.env.STALE_WEBHOOK_LOCK_SECS || "300", 10),
  );
  const cutoff = new Date(Date.now() - staleSecs * 1000);
  const reclaimed = await db
    .update(schema.webhookDeliveries)
    .set({ status: "pending", lockedAt: null })
    .where(
      and(
        eq(schema.webhookDeliveries.status, "processing"),
        lt(schema.webhookDeliveries.lockedAt, cutoff),
      ),
    )
    .returning({ id: schema.webhookDeliveries.id });

  if (reclaimed.length > 0) {
    logger.warn(
      { count: reclaimed.length },
      "Reclaimed stale webhook deliveries stuck in processing",
    );
  }
  return reclaimed.length;
}

export type DeliveryOutcome =
  | "delivered"
  | "retrying"
  | "dead"
  | "skipped";

/**
 * Perform exactly one delivery attempt for a queued delivery row, then
 * transition it: delivered / back to pending (with backoff) / dead.
 */
export async function deliverWebhookDelivery(
  deliveryId: string,
): Promise<DeliveryOutcome> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const delivery = await db.query.webhookDeliveries.findFirst({
    where: eq(schema.webhookDeliveries.id, deliveryId),
  });
  if (!delivery) return "skipped";
  if (delivery.status === "delivered" || delivery.status === "dead") {
    return "skipped";
  }

  const webhook = await db.query.webhooks.findFirst({
    where: eq(schema.webhooks.id, delivery.webhookId),
  });
  if (!webhook) {
    await markDead(db, deliveryId, attemptNumber(delivery), "Webhook no longer exists");
    return "dead";
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(delivery.payload);
  } catch (error: any) {
    await markDead(
      db,
      deliveryId,
      attemptNumber(delivery),
      `Stored payload is not valid JSON: ${error?.message ?? error}`,
    );
    return "dead";
  }

  const attempt = attemptNumber(delivery);
  const total = maxAttempts();
  const outcome = await attemptDelivery(
    webhook,
    delivery.event,
    payload,
    delivery.id,
    attempt,
    total,
  );

  if (outcome.success) {
    await db
      .update(schema.webhookDeliveries)
      .set({
        status: "delivered",
        attempts: attempt,
        responseCode: outcome.responseCode ?? null,
        responseBody: outcome.responseBody ?? null,
        durationMs: outcome.durationMs ?? null,
        requestHeaders: outcome.requestHeaders
          ? JSON.stringify(outcome.requestHeaders)
          : null,
        responseHeaders: outcome.responseHeaders
          ? JSON.stringify(outcome.responseHeaders)
          : null,
        error: null,
        failureReason: null,
        lockedAt: null,
      })
      .where(eq(schema.webhookDeliveries.id, deliveryId));
    return "delivered";
  }

  const errorMessage = outcome.error ?? "Unknown delivery error";

  // 4xx from the receiver: retrying won't help (bad payload/secret) — die now.
  if (!outcome.nonRetryable && attempt < total) {
    const delayMs = backoffDelay(attempt);
    await db
      .update(schema.webhookDeliveries)
      .set({
        status: "pending",
        attempts: attempt,
        nextAttemptAt: new Date(Date.now() + delayMs),
        responseCode: outcome.responseCode ?? null,
        responseBody: outcome.responseBody ?? null,
        durationMs: outcome.durationMs ?? null,
        requestHeaders: outcome.requestHeaders
          ? JSON.stringify(outcome.requestHeaders)
          : null,
        error: errorMessage,
        failureReason: null,
        lockedAt: null,
      })
      .where(eq(schema.webhookDeliveries.id, deliveryId));
    logger.info(
      {
        webhookId: webhook.id,
        deliveryId,
        attempt,
        total,
        delayMs,
      },
      "Webhook delivery failed — scheduled retry",
    );
    return "retrying";
  }

  const reason = outcome.nonRetryable
    ? `Not retryable: ${errorMessage}`
    : `Failed after ${attempt}/${total} attempts`;
  await markDeadWithOutcome(db, deliveryId, attempt, reason, outcome);
  logger.error(
    { webhookId: webhook.id, deliveryId, attempt, total, error: errorMessage },
    "Webhook delivery dead-lettered",
  );
  return "dead";
}

function attemptNumber(
  delivery: typeof schema.webhookDeliveries.$inferSelect,
): number {
  return (delivery.attempts ?? 0) + 1;
}

async function markDead(
  db: NodePgDatabase<typeof schema>,
  deliveryId: string,
  attempt: number,
  reason: string,
): Promise<void> {
  await db
    .update(schema.webhookDeliveries)
    .set({
      status: "dead",
      attempts: attempt,
      failureReason: reason,
      error: reason,
      lockedAt: null,
    })
    .where(eq(schema.webhookDeliveries.id, deliveryId));
}

async function markDeadWithOutcome(
  db: NodePgDatabase<typeof schema>,
  deliveryId: string,
  attempt: number,
  reason: string,
  outcome: AttemptOutcome,
): Promise<void> {
  await db
    .update(schema.webhookDeliveries)
    .set({
      status: "dead",
      attempts: attempt,
      failureReason: reason,
      error: outcome.error ?? reason,
      responseCode: outcome.responseCode ?? null,
      responseBody: outcome.responseBody ?? null,
      durationMs: outcome.durationMs ?? null,
      requestHeaders: outcome.requestHeaders
        ? JSON.stringify(outcome.requestHeaders)
        : null,
      responseHeaders: outcome.responseHeaders
        ? JSON.stringify(outcome.responseHeaders)
        : null,
      lockedAt: null,
    })
    .where(eq(schema.webhookDeliveries.id, deliveryId));
}

// ── Single-attempt HTTP delivery ──────────────────────────────────────────────

interface AttemptOutcome {
  success: boolean;
  responseCode?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  requestHeaders?: Record<string, string>;
  durationMs?: number;
  error?: string;
  /** Receiver returned 4xx — retrying cannot succeed. */
  nonRetryable?: boolean;
}

/**
 * One HTTP delivery attempt. Persists nothing except the atomic webhook stat
 * bump; the caller owns the delivery-row state transitions.
 */
async function attemptDelivery(
  webhook: WebhookRow,
  event: string,
  payload: WebhookPayload,
  deliveryId: string,
  attempt: number,
  totalAttempts: number,
): Promise<AttemptOutcome> {
  const startTime = Date.now();

  try {
    // SSRF protection: validate URL resolves to a public IP
    const urlCheck = await validateWebhookUrl(webhook.url);
    const { isOfflineMode } = await import("@/lib/config");

    if (isOfflineMode()) {
      if (urlCheck.valid) {
        throw new Error(`Webhook blocked: External webhooks are disabled in Air-Gapped/Offline mode`);
      }
      if (urlCheck.reason && (urlCheck.reason.includes("Invalid") || urlCheck.reason.includes("localhost"))) {
        throw new Error(`Webhook blocked: ${urlCheck.reason}`);
      }
      // If it's a private IP, we ALLOW it in offline mode!
    } else {
      if (!urlCheck.valid) {
        logger.warn(
          { webhookId: webhook.id, url: webhook.url, reason: urlCheck.reason },
          "Webhook URL blocked by SSRF protection",
        );
        throw new Error(`SSRF blocked: ${urlCheck.reason}`);
      }
    }

    // Generate signature (skip header entirely when no secret is configured)
    const signature = webhook.secret
      ? signPayload(payload, webhook.secret)
      : null;

    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "OpenCodeHub-Hookshot/1.0",
      "X-OpenCodeHub-Event": event,
      "X-OpenCodeHub-Delivery": deliveryId,
      "X-OpenCodeHub-Attempt": String(attempt),
    };
    if (signature) {
      headers["X-Hub-Signature-256"] = `sha256=${signature}`;
    }

    // Make request with a 10-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    try {
      response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const ok = response.ok;
    const responseBody = (await response.text()).slice(0, 1000); // Truncate

    // Update webhook stats (atomic increment to prevent race conditions)
    await bumpWebhookStats(webhook.id, ok);

    return {
      success: ok,
      responseCode: response.status,
      responseBody,
      responseHeaders: Object.fromEntries(response.headers.entries()),
      requestHeaders: headers,
      durationMs: Date.now() - startTime,
      error: ok
        ? undefined
        : `attempt ${attempt}/${totalAttempts} HTTP ${response.status}`,
      nonRetryable: !ok && response.status >= 400 && response.status < 500,
    };
  } catch (error: any) {
    // Update webhook stats (atomic increment)
    await bumpWebhookStats(webhook.id, false);

    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: `attempt ${attempt}/${totalAttempts}: ${error?.message ?? error}`,
    };
  }
}

/** Atomic per-attempt stat bump (unchanged semantics from inline dispatch). */
async function bumpWebhookStats(webhookId: string, ok: boolean): Promise<void> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  await db
    .update(schema.webhooks)
    .set({
      deliveryCount: sql`COALESCE(${schema.webhooks.deliveryCount}, 0) + 1`,
      lastDeliveryStatus: ok ? "success" : "failure",
      lastDeliveryAt: new Date(),
    })
    .where(eq(schema.webhooks.id, webhookId));
}

/**
 * Sign payload with secret using HMAC-SHA256
 */
function signPayload(payload: any, secret: string): string {
  if (!secret) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}
