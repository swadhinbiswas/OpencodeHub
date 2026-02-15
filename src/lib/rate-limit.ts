
import { logger } from "@/lib/logger";

// Try to import Redis - may not be configured
let redis: any = null;
let redisAvailable = false;

try {
    const redisModule = await import("@/lib/redis");
    redis = redisModule.redis;
    // Verify connection works
    await redis.ping();
    redisAvailable = true;
    logger.info("Distributed rate limiting enabled (Redis)");
} catch (e) {
    logger.warn("Redis not available - using in-memory rate limiting (not distributed-safe)");
}

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

/**
 * In-memory rate limiter (fallback when Redis unavailable)
 */
class InMemoryRateLimiter {
    private store: Map<string, RateLimitEntry> = new Map();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Cleanup expired entries every 60 seconds
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }

    private cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (now > entry.resetTime) {
                this.store.delete(key);
            }
        }
    }

    async check(
        identifier: string,
        limit: number,
        windowMs: number
    ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
        const now = Date.now();
        const entry = this.store.get(identifier);

        if (!entry || now > entry.resetTime) {
            // New window
            const resetTime = now + windowMs;
            this.store.set(identifier, { count: 1, resetTime });
            return { allowed: true, remaining: limit - 1, resetTime };
        }

        if (entry.count >= limit) {
            // Limit exceeded
            return { allowed: false, remaining: 0, resetTime: entry.resetTime };
        }

        // Increment count
        entry.count++;
        this.store.set(identifier, entry);
        return {
            allowed: true,
            remaining: limit - entry.count,
            resetTime: entry.resetTime,
        };
    }

    destroy() {
        clearInterval(this.cleanupInterval);
    }
}

/**
 * Redis-based distributed rate limiter using sliding window
 */
class RedisRateLimiter {
    /**
     * Check rate limit using Redis with sliding window algorithm
     */
    async check(
        identifier: string,
        limit: number,
        windowMs: number
    ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
        const now = Date.now();
        const windowSeconds = Math.ceil(windowMs / 1000);
        const key = `ratelimit:${identifier}`;

        try {
            // Use Redis INCR with EXPIRE for atomic counting
            // This implements a fixed window algorithm (simpler and efficient)
            const multi = redis.multi();
            multi.incr(key);
            multi.pttl(key); // Get TTL in milliseconds

            const results = await multi.exec();

            // ioredis exec returns [[err, result], [err, result]]
            // We need to handle potential nulls if exec failed entirely (unlikely if we got here)
            if (!results) {
                throw new Error("Redis transaction failed");
            }

            const countResult = results[0];
            const ttlResult = results[1];

            // Check for errors in individual commands
            if (countResult[0]) throw countResult[0];
            if (ttlResult[0]) throw ttlResult[0];

            const count = countResult[1] as number;
            let ttl = ttlResult[1] as number;

            // If this is a new key (first request in window), set expiry
            if (count === 1 || ttl === -1) {
                await redis.pexpire(key, windowMs);
                ttl = windowMs;
            }

            const resetTime = now + Math.max(ttl, 0);
            const remaining = Math.max(0, limit - count);

            return {
                allowed: count <= limit,
                remaining,
                resetTime,
            };
        } catch (error) {
            logger.error({ error, identifier }, "Redis rate limit check failed, allowing request");
            // Fail open - allow request if Redis fails
            return {
                allowed: true,
                remaining: limit,
                resetTime: now + windowMs,
            };
        }
    }

    destroy() {
        // Redis handles connections automatically with Upstash
    }
}

// Create the appropriate rate limiter based on availability
export const rateLimiter = redisAvailable ? new RedisRateLimiter() : new InMemoryRateLimiter();
export const isDistributed = redisAvailable;
