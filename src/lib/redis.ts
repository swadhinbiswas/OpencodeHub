import Redis from "ioredis";
import { logger } from "@/lib/logger";

// Create a Redis client
// Uses REDIS_URL environment variable by default
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const safeRedisUrl = redisUrl.replace(/:\/\/([^:@]+)(:[^@]+)?@/, "://$1:***@");
logger.info({ redisUrl: safeRedisUrl }, "Redis configured");

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

redis.on("error", (error) => {
    logger.warn({ error }, "Redis connection error");
});

redis.on("connect", () => {
    logger.info("Redis connected");
});

/**
 * Set a user session
 * @param sessionId Session ID
 * @param data Session data
 * @param ttl Time to live in seconds (default 1 week)
 */
export async function setSession(sessionId: string, data: any, ttl = 7 * 24 * 60 * 60) {
    if (redis.status !== "ready") return;
    try {
        await redis.setex(sessionId, ttl, JSON.stringify(data));
    } catch (e) {
        logger.error({ error: e }, "Failed to set session in Redis");
    }
}

/**
 * Get a user session
 * @param sessionId Session ID
 * @returns Session data or null
 */
export async function getSession(sessionId: string) {
    if (redis.status !== "ready") return null;
    try {
        const data = await redis.get(sessionId);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        logger.error({ error: e }, "Failed to get session from Redis");
        return null;
    }
}

/**
 * Delete a user session
 * @param sessionId Session ID
 */
export async function deleteSession(sessionId: string) {
    if (redis.status !== "ready") return;
    try {
        await redis.del(sessionId);
    } catch (e) {
        logger.error({ error: e }, "Failed to delete session from Redis");
    }
}
