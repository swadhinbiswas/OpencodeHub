/**
 * Webhook Dispatch Service
 * Handles triggering and delivering webhooks
 */

import crypto from "crypto";
import { getDatabase, schema } from "@/db";
import { generateId } from "./utils";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

interface WebhookPayload {
    [key: string]: any;
}

/**
 * Trigger webhooks for a specific repository and event
 */
export async function triggerWebhooks(
    repositoryId: string,
    event: string,
    payload: WebhookPayload
): Promise<void> {
    const db = getDatabase();

    // Find active webhooks for this repo
    const webhooks = await db.query.webhooks.findMany({
        where: and(
            eq(schema.webhooks.repositoryId, repositoryId),
            eq(schema.webhooks.active, true)
        ),
    });

    // Filter webhooks that subscribe to this event
    const matchingWebhooks = webhooks.filter((hook) => {
        const events = Array.isArray(hook.events) ? hook.events : JSON.parse(hook.events as any);
        return events.includes(event) || events.includes("*");
    });

    if (matchingWebhooks.length === 0) return;

    logger.info(
        { repositoryId, event, webhooks: matchingWebhooks.length },
        "Triggering webhooks"
    );

    // Dispatch to all matching webhooks (fire and forget)
    // In a real system, this would go to a job queue (BullMQ/Redis)
    // For now, we'll run it asynchronously
    matchingWebhooks.forEach((hook) => {
        dispatchWebhook(hook, event, payload).catch((err) => {
            logger.error({ webhookId: hook.id, err }, "Failed to dispatch webhook");
        });
    });
}

/**
 * Dispatch a single webhook
 */
async function dispatchWebhook(
    webhook: typeof schema.webhooks.$inferSelect,
    event: string,
    payload: WebhookPayload
): Promise<void> {
    const db = getDatabase();
    const deliveryId = generateId();
    const startTime = Date.now();

    try {
        // Generate signature
        const signature = signPayload(payload, webhook.secret || "");

        // Prepare headers
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": "OpenCodeHub-Hookshot/1.0",
            "X-OpenCodeHub-Event": event,
            "X-OpenCodeHub-Delivery": deliveryId,
            "X-Hub-Signature-256": `sha256=${signature}`,
        };

        // Make request
        const response = await fetch(webhook.url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        const durationMs = Date.now() - startTime;
        const responseBody = await response.text();

        // Log delivery
        await db.insert(schema.webhookDeliveries).values({
            id: deliveryId,
            webhookId: webhook.id,
            event,
            payload,
            status: response.ok ? "success" : "failure",
            responseCode: response.status,
            responseBody: responseBody.slice(0, 1000), // Truncate
            durationMs,
            requestHeaders: headers,
            responseHeaders: Object.fromEntries(response.headers.entries()),
        });

        // Update webhook stats
        await db
            .update(schema.webhooks)
            .set({
                deliveryCount: (webhook.deliveryCount || 0) + 1,
                lastDeliveryStatus: response.ok ? "success" : "failure",
                lastDeliveryAt: new Date().toISOString(),
            })
            .where(eq(schema.webhooks.id, webhook.id));

    } catch (error: any) {
        const durationMs = Date.now() - startTime;

        // Log failure
        await db.insert(schema.webhookDeliveries).values({
            id: deliveryId,
            webhookId: webhook.id,
            event,
            payload,
            status: "failure",
            responseCode: 0,
            error: error.message,
            durationMs,
        });

        // Update webhook stats
        await db
            .update(schema.webhooks)
            .set({
                deliveryCount: (webhook.deliveryCount || 0) + 1,
                lastDeliveryStatus: "failure",
                lastDeliveryAt: new Date().toISOString(),
            })
            .where(eq(schema.webhooks.id, webhook.id));
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
