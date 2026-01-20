/**
 * Real-time Updates Library
 * Server-Sent Events (SSE) and browser notifications for live updates
 */

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";

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
 * Broadcast an event to a specific user's connections
 */
export function sendToUser(userId: string, event: RealtimeEvent): number {
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
 * Broadcast an event to all users subscribed to a repository
 */
export function broadcastToRepository(repositoryId: string, event: RealtimeEvent): number {
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
 * Broadcast an event to all connected users
 */
export function broadcastToAll(event: RealtimeEvent): number {
    let sent = 0;

    for (const connectionId of connections.keys()) {
        if (sendToConnection(connectionId, event)) {
            sent++;
        }
    }

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

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            connectionId = registerConnection(userId, controller, repositories);

            // Send heartbeat every 30 seconds to keep connection alive
            const heartbeatInterval = setInterval(() => {
                try {
                    controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
                } catch {
                    clearInterval(heartbeatInterval);
                }
            }, 30000);
        },
        cancel() {
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
