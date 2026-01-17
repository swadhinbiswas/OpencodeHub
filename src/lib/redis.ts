
import { Redis } from '@upstash/redis';

// Create a Redis client
// This works with both serverless and long-running environments
export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Set a user session
 * @param sessionId Session ID
 * @param data Session data
 * @param ttl Time to live in seconds (default 1 week)
 */
export async function setSession(sessionId: string, data: any, ttl = 7 * 24 * 60 * 60) {
    await redis.setex(sessionId, ttl, JSON.stringify(data));
}

/**
 * Get a user session
 * @param sessionId Session ID
 * @returns Session data or null
 */
export async function getSession(sessionId: string) {
    const data = await redis.get(sessionId);
    return data && typeof data === 'string' ? JSON.parse(data) : data || null;
}

/**
 * Delete a user session
 * @param sessionId Session ID
 */
export async function deleteSession(sessionId: string) {
    await redis.del(sessionId);
}
