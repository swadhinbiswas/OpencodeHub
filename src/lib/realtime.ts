/**
 * Real-time Updates Library
 * Server-Sent Events (SSE) and browser notifications for live updates
 */

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type Redis from "ioredis";
import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

// Event types for real-time updates
export type RealtimeEventType =
    | "pr:opened"
    | "pr:updated"
    | "pr:merged"
    | "pr:closed"
    | "pr:review_requested"
    | "pr:approved"
    | "pr:changes_requested"
    | "ci:started"
    | "ci:passed"
    | "ci:failed"
    | "queue:added"
    | "queue:position_changed"
    | "queue:merging"
    | "queue:merged"
    | "notification:new"
    | "inbox:refresh";

export interface RealtimeEvent<T = unknown> {
    type: RealtimeEventType;
    timestamp: Date;
    data: T;
}

// In-memory store for active connections
interface Connection {
    userId: string;
    controller: ReadableStreamDefaultController<Uint8Array>;
    repositories: string[]; // Subscribed repository IDs
    createdAt: Date;
}

const connections = new Map<string, Connection>();

// === Cross-process fanout (Redis Pub/Sub bridge) ===
//
// SSE connections live in this process's memory only. Background processes
// (worker, runner) run in separate OS processes, so their events must be
// relayed over Redis pub/sub to reach browsers connected to the web process.
//
// - Channel: `och:realtime`
// - Envelope: JSON `{ originId, target, event }` — receivers drop messages
//   whose originId matches their own (prevents double-delivery).
// - Degradation: if Redis is unavailable, delivery silently falls back to
//   local-only with a single warn log until the connection recovers.

const REALTIME_CHANNEL = "och:realtime";
const ORIGIN_ID = crypto.randomUUID();

type RealtimeBridgeTarget =
    | { kind: "all" }
    | { kind: "user"; userId: string }
    | { kind: "repository"; repositoryId: string }
    | { kind: "connection"; connectionId: string };

interface RealtimeBridgeMessage {
    originId: string;
    target: RealtimeBridgeTarget;
    event: RealtimeEvent;
}

interface BridgeConnections {
    subscriber: Redis;
    publisher: Redis;
}

let bridge: BridgeConnections | null = null;
let bridgeInitPromise: Promise<void> | null = null;
let bridgeDegradedLogged = false;

function isRedisBridgeEnabled(): boolean {
    return !(
        process.env.SKIP_REDIS_CHECK === "1" || process.env.NODE_ENV === "test"
    );
}

function logBridgeDegraded(scope: string, error: unknown): void {
    if (bridgeDegradedLogged) return;
    bridgeDegradedLogged = true;
    logger.warn(
        "Realtime Redis bridge degraded; falling back to local-only delivery",
        { scope, error }
    );
}

function logBridgeRecovered(scope: string): void {
    if (!bridgeDegradedLogged) return;
    bridgeDegradedLogged = false;
    logger.info("Realtime Redis bridge recovered", { scope });
}

/**
 * Lazily create dedicated publisher/subscriber connections and subscribe.
 * Pub/sub requires one connection per role, so both are duplicated from the
 * shared client factory. Never throws — on failure the bridge stays disabled
 * and delivery remains local-only.
 */
async function ensureBridge(): Promise<void> {
    if (bridge || !isRedisBridgeEnabled()) return;
    if (bridgeInitPromise) return bridgeInitPromise;

    bridgeInitPromise = (async () => {
        try {
            const subscriber = redis.duplicate();
            const publisher = redis.duplicate();

            // duplicated instances do not inherit listeners; without these an
            // 'error' event would crash the process
            subscriber.on("error", (error: Error) => {
                logBridgeDegraded("subscriber", error);
            });
            publisher.on("error", (error: Error) => {
                logBridgeDegraded("publisher", error);
            });

            subscriber.on("message", (channel: string, raw: string) => {
                if (channel !== REALTIME_CHANNEL) return;
                handleBridgeMessage(raw);
            });

            await subscriber.subscribe(REALTIME_CHANNEL);
            logBridgeRecovered("subscriber");

            bridge = { subscriber, publisher };
        } catch (error) {
            logBridgeDegraded("init", error);
        } finally {
            bridgeInitPromise = null;
        }
    })();

    return bridgeInitPromise;
}

function handleBridgeMessage(raw: string): void {
    let message: RealtimeBridgeMessage;
    try {
        message = JSON.parse(raw) as RealtimeBridgeMessage;
    } catch {
        logger.warn("Dropping malformed realtime bridge message");
        return;
    }

    if (!message || message.originId === ORIGIN_ID) return;

    try {
        // timestamp round-trips as an ISO string through JSON; revive it so
        // local consumers still receive a Date
        const event: RealtimeEvent = {
            ...message.event,
            timestamp: new Date(message.event.timestamp),
        };
        deliverLocally(message.target, event);
    } catch (error) {
        logger.error("Failed to deliver bridged realtime event", { error });
    }
}

function deliverLocally(target: RealtimeBridgeTarget, event: RealtimeEvent): number {
    switch (target.kind) {
        case "user":
            return sendToUserLocal(target.userId, event);
        case "repository":
            return broadcastToRepositoryLocal(target.repositoryId, event);
        case "connection":
            return sendToConnection(target.connectionId, event) ? 1 : 0;
        case "all":
        default:
            return broadcastToAllLocal(event);
    }
}

/**
 * Fire-and-forget publish of an event to other processes via Redis.
 * Never throws and never affects local delivery; returns whether the
 * message was handed to Redis.
 */
async function publishToBridge(
    target: RealtimeBridgeTarget,
    event: RealtimeEvent
): Promise<boolean> {
    try {
        await ensureBridge();
        if (!bridge) return false;

        const payload: RealtimeBridgeMessage = { originId: ORIGIN_ID, target, event };
        const receivers = await bridge.publisher.publish(
            REALTIME_CHANNEL,
            JSON.stringify(payload)
        );
        logBridgeRecovered("publisher");
        logger.debug("Realtime event published cross-process", {
            type: event.type,
            targetKind: target.kind,
            receivers,
        });
        return true;
    } catch (error) {
        logBridgeDegraded("publish", error);
        return false;
    }
}

/**
 * Publish a realtime event from a process that holds no SSE connections
 * itself (e.g. the background worker or CI runner). The web process(s)
 * subscribed to `och:realtime` will fan the event out to connected browsers.
 */
export async function publishRealtimeEvent(
    target: RealtimeBridgeTarget,
    event: RealtimeEvent
): Promise<boolean> {
    return publishToBridge(target, event);
}

/**
 * Create a unique connection ID
 */
function generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Register a new SSE connection
 */
export function registerConnection(
    userId: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
    repositories: string[] = []
): string {
    // Web processes are primarily receivers of cross-process events; make sure
    // the pub/sub subscription exists as soon as the first browser connects
    void ensureBridge();

    const connectionId = generateConnectionId();

    connections.set(connectionId, {
        userId,
        controller,
        repositories,
        createdAt: new Date(),
    });

    logger.info("SSE connection registered", {
        connectionId,
        userId,
        repositories: repositories.length,
    });

    // Send initial connection confirmation
    sendToConnection(connectionId, {
        type: "inbox:refresh",
        timestamp: new Date(),
        data: { connected: true, connectionId },
    });

    return connectionId;
}

/**
 * Unregister an SSE connection
 */
export function unregisterConnection(connectionId: string): void {
    const connection = connections.get(connectionId);
    if (connection) {
        connections.delete(connectionId);
        logger.info("SSE connection unregistered", {
            connectionId,
            userId: connection.userId,
        });
    }
}

/**
 * Send an event to a specific connection
 */
export function sendToConnection(connectionId: string, event: RealtimeEvent): boolean {
    const connection = connections.get(connectionId);
    if (!connection) return false;

    try {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        connection.controller.enqueue(new TextEncoder().encode(data));
        return true;
    } catch (error) {
        logger.error("Failed to send to connection", { connectionId, error });
        unregisterConnection(connectionId);
        return false;
    }
}

/**
 * Local-only delivery to a specific user's connections
 */
function sendToUserLocal(userId: string, event: RealtimeEvent): number {
    let sent = 0;

    for (const [connectionId, connection] of connections.entries()) {
        if (connection.userId === userId) {
            if (sendToConnection(connectionId, event)) {
                sent++;
            }
        }
    }

    return sent;
}

/**
 * Broadcast an event to a specific user's connections locally and to
 * subscribers in all other processes via Redis
 */
export function sendToUser(userId: string, event: RealtimeEvent): number {
    const sent = sendToUserLocal(userId, event);
    void publishToBridge({ kind: "user", userId }, event);
    return sent;
}

/**
 * Local-only delivery to all users subscribed to a repository
 */
function broadcastToRepositoryLocal(repositoryId: string, event: RealtimeEvent): number {
    let sent = 0;

    for (const [connectionId, connection] of connections.entries()) {
        if (connection.repositories.includes(repositoryId) || connection.repositories.length === 0) {
            if (sendToConnection(connectionId, event)) {
                sent++;
            }
        }
    }

    return sent;
}

/**
 * Broadcast an event to all users subscribed to a repository locally and to
 * subscribers in all other processes via Redis
 */
export function broadcastToRepository(repositoryId: string, event: RealtimeEvent): number {
    const sent = broadcastToRepositoryLocal(repositoryId, event);
    void publishToBridge({ kind: "repository", repositoryId }, event);
    return sent;
}

/**
 * Local-only delivery to all connected users
 */
function broadcastToAllLocal(event: RealtimeEvent): number {
    let sent = 0;

    for (const connectionId of connections.keys()) {
        if (sendToConnection(connectionId, event)) {
            sent++;
        }
    }

    return sent;
}

/**
 * Broadcast an event to all connected users locally and to subscribers in
 * all other processes via Redis
 */
export function broadcastToAll(event: RealtimeEvent): number {
    const sent = broadcastToAllLocal(event);
    void publishToBridge({ kind: "all" }, event);
    return sent;
}

/**
 * Get connection statistics
 */
export function getConnectionStats(): {
    totalConnections: number;
    uniqueUsers: number;
    connectionsByUser: Record<string, number>;
} {
    const userCounts: Record<string, number> = {};

    for (const connection of connections.values()) {
        userCounts[connection.userId] = (userCounts[connection.userId] || 0) + 1;
    }

    return {
        totalConnections: connections.size,
        uniqueUsers: Object.keys(userCounts).length,
        connectionsByUser: userCounts,
    };
}

/**
 * Clean up stale connections (older than specified duration)
 */
export function cleanupStaleConnections(maxAgeMs: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [connectionId, connection] of connections.entries()) {
        if (now - connection.createdAt.getTime() > maxAgeMs) {
            try {
                connection.controller.close();
            } catch {
                // Ignore close errors
            }
            connections.delete(connectionId);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        logger.info("Cleaned up stale SSE connections", { count: cleaned });
    }

    return cleaned;
}

// === Event Emitters ===

/**
 * Emit a PR event to relevant users
 */
export async function emitPREvent(
    prId: string,
    eventType: "opened" | "updated" | "merged" | "closed" | "review_requested" | "approved" | "changes_requested",
    metadata?: Record<string, unknown>
) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    try {
        const pr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.id, prId),
            with: {
                repository: true,
                author: true,
            },
        });

        if (!pr) return;

        const event: RealtimeEvent = {
            type: `pr:${eventType}` as RealtimeEventType,
            timestamp: new Date(),
            data: {
                prId: pr.id,
                prNumber: pr.number,
                title: pr.title,
                repositoryId: pr.repositoryId,
                repositoryName: pr.repository?.name,
                authorUsername: pr.author?.username,
                ...metadata,
            },
        };

        // Broadcast to repository subscribers
        broadcastToRepository(pr.repositoryId, event);

        // Also send to PR author
        if (pr.author?.id) {
            sendToUser(pr.author.id, event);
        }
    } catch (error) {
        logger.error("Failed to emit PR event", { prId, eventType, error });
    }
}

/**
 * Emit a CI event
 */
export async function emitCIEvent(
    prId: string,
    status: "started" | "passed" | "failed",
    metadata?: Record<string, unknown>
) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    try {
        const pr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.id, prId),
            with: { author: true },
        });

        if (!pr) return;

        const event: RealtimeEvent = {
            type: `ci:${status}` as RealtimeEventType,
            timestamp: new Date(),
            data: {
                prId: pr.id,
                prNumber: pr.number,
                repositoryId: pr.repositoryId,
                ...metadata,
            },
        };

        broadcastToRepository(pr.repositoryId, event);

        if (pr.author?.id) {
            sendToUser(pr.author.id, event);
        }
    } catch (error) {
        logger.error("Failed to emit CI event", { prId, status, error });
    }
}

/**
 * Emit a merge queue event
 */
export async function emitQueueEvent(
    repositoryId: string,
    eventType: "added" | "position_changed" | "merging" | "merged",
    prId: string,
    metadata?: Record<string, unknown>
) {
    const event: RealtimeEvent = {
        type: `queue:${eventType}` as RealtimeEventType,
        timestamp: new Date(),
        data: {
            repositoryId,
            prId,
            ...metadata,
        },
    };

    broadcastToRepository(repositoryId, event);
}

/**
 * Emit a notification event
 */
export function emitNotification(
    userId: string,
    notification: {
        id: string;
        type: string;
        title: string;
        body?: string;
        url?: string;
    }
) {
    const event: RealtimeEvent = {
        type: "notification:new",
        timestamp: new Date(),
        data: notification,
    };

    sendToUser(userId, event);
}

// === Helper for creating SSE response ===

/**
 * Create an SSE-compatible Response
 */
export function createSSEResponse(
    userId: string,
    repositories: string[] = []
): Response {
    let connectionId: string;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            connectionId = registerConnection(userId, controller, repositories);

            // Send heartbeat every 30 seconds to keep connection alive
            heartbeatInterval = setInterval(() => {
                try {
                    controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
                } catch {
                    if (heartbeatInterval) clearInterval(heartbeatInterval);
                }
            }, 30000);
        },
        cancel() {
            // Clear heartbeat interval to prevent memory leak
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            if (connectionId) {
                unregisterConnection(connectionId);
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no", // Disable Nginx buffering
        },
    });
}

// Start cleanup interval (every 5 minutes)
if (typeof setInterval !== "undefined") {
    setInterval(() => {
        cleanupStaleConnections();
    }, 5 * 60 * 1000);
}
