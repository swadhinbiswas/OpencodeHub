/**
 * Webhook Dispatch Service
 * Handles triggering and delivering webhooks
 */

import { getDatabase, schema } from "@/db";
import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "./logger";
import { validateWebhookUrl } from "./url-validator";
import { generateId } from "./utils";

interface WebhookPayload {
  [key: string]: any;
}

/**
 * Trigger webhooks for a specific repository and event
 */
export async function triggerWebhooks(
  repositoryId: string,
  event: string,
  payload: WebhookPayload,
): Promise<void> {
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

  if (matchingWebhooks.length === 0) return;

  logger.info(
    { repositoryId, event, webhooks: matchingWebhooks.length },
    "Triggering webhooks",
  );

  const results = await Promise.allSettled(
    matchingWebhooks.map((hook) => dispatchWebhook(hook, event, payload)),
  );

  const failures = results.filter(
    (result) => result.status === "rejected",
  ).length;
  if (failures > 0) {
    logger.warn(
      { repositoryId, event, failures },
      "Some webhook dispatches failed",
    );
  }
}

/**
 * Dispatch a single webhook with retry + exponential backoff.
 * Non-2xx responses and network errors are retried up to
 * WEBHOOK_MAX_RETRIES times (default 4) with 1s→16s backoff.
 * One delivery row is logged per attempt.
 */
async function dispatchWebhook(
  webhook: typeof schema.webhooks.$inferSelect,
  event: string,
  payload: WebhookPayload,
): Promise<void> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const maxRetries = Math.max(
    0,
    parseInt(process.env.WEBHOOK_MAX_RETRIES || "4", 10),
  );

  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 16_000);
      logger.info(
        { webhookId: webhook.id, attempt, backoffMs },
        "Retrying webhook delivery",
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }

    const outcome = await deliverOnce(
      webhook,
      event,
      payload,
      attempt + 1,
      maxRetries + 1,
    );
    lastError = outcome.error ?? null;
    lastResponse = outcome.response ?? null;

    // Success (2xx) — stop retrying
    if (outcome.success) return;
    // 4xx from the receiver: retrying won't help (bad payload/secret) — stop
    if (
      lastResponse &&
      lastResponse.status >= 400 &&
      lastResponse.status < 500
    ) {
      logger.warn(
        { webhookId: webhook.id, status: lastResponse.status },
        "Webhook rejected with 4xx, not retrying",
      );
      return;
    }
  }

  if (!lastError && lastResponse) {
    lastError = new Error(`Webhook failed with HTTP ${lastResponse.status}`);
  }
  logger.error(
    { webhookId: webhook.id, error: lastError },
    "Webhook delivery failed after retries",
  );
}

/**
 * Single delivery attempt. Returns { success } and logs the delivery row.
 */
async function deliverOnce(
  webhook: typeof schema.webhooks.$inferSelect,
  event: string,
  payload: WebhookPayload,
  attempt: number,
  totalAttempts: number,
): Promise<{ success: boolean; error?: unknown; response?: Response }> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const deliveryId = generateId();
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

    const durationMs = Date.now() - startTime;
    const responseBody = await response.text();
    const ok = response.ok;

    // Log delivery
    await db.insert(schema.webhookDeliveries).values({
      id: deliveryId,
      webhookId: webhook.id,
      event,
      payload: JSON.stringify(payload),
      status: ok ? "success" : "failure",
      responseCode: response.status,
      responseBody: responseBody.slice(0, 1000), // Truncate
      durationMs,
      error: ok
        ? null
        : `attempt ${attempt}/${totalAttempts} HTTP ${response.status}`,
      requestHeaders: JSON.stringify(headers),
      responseHeaders: JSON.stringify(
        Object.fromEntries(response.headers.entries()),
      ),
    });

    // Update webhook stats (atomic increment to prevent race conditions)
    await db
      .update(schema.webhooks)
      .set({
        deliveryCount: sql`COALESCE(${schema.webhooks.deliveryCount}, 0) + 1`,
        lastDeliveryStatus: ok ? "success" : "failure",
        lastDeliveryAt: new Date(),
      })
      .where(eq(schema.webhooks.id, webhook.id));

    return { success: ok, response, error: ok ? undefined : new Error(`HTTP ${response.status}`) };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    // Log failure
    await db.insert(schema.webhookDeliveries).values({
      id: deliveryId,
      webhookId: webhook.id,
      event,
      payload: JSON.stringify(payload),
      status: "failure",
      responseCode: 0,
      error: `attempt ${attempt}/${totalAttempts}: ${error.message}`,
      durationMs,
    });

    // Update webhook stats (atomic increment)
    await db
      .update(schema.webhooks)
      .set({
        deliveryCount: sql`COALESCE(${schema.webhooks.deliveryCount}, 0) + 1`,
        lastDeliveryStatus: "failure",
        lastDeliveryAt: new Date(),
      })
      .where(eq(schema.webhooks.id, webhook.id));

    return { success: false, error };
  }
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
