
import Redis from "ioredis";
import { logger } from "@/lib/logger";

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

export interface RateLimitDecision {
    allowed: boolean;
    remaining: number;
    resetTime: number;
}

export interface RateLimiter {
    check(identifier: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
    destroy(): void;
}

class InMemoryRateLimiter implements RateLimiter {
    private store: Map<string, RateLimitEntry> = new Map();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }

    private cleanup(): void {
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
        windowMs: number,
    ): Promise<RateLimitDecision> {
        const now = Date.now();
        const entry = this.store.get(identifier);

        if (!entry || now > entry.resetTime) {
            const resetTime = now + windowMs;
            this.store.set(identifier, { count: 1, resetTime });
            return { allowed: true, remaining: limit - 1, resetTime };
        }

        if (entry.count >= limit) {
            return { allowed: false, remaining: 0, resetTime: entry.resetTime };
        }

        entry.count++;
        this.store.set(identifier, entry);
        return {
            allowed: true,
            remaining: limit - entry.count,
            resetTime: entry.resetTime,
        };
    }

    destroy(): void {
        clearInterval(this.cleanupInterval);
    }
}

class RedisRateLimiter implements RateLimiter {
    private readonly fallback = new InMemoryRateLimiter();

    constructor(private readonly redis: Redis) {}

    async check(
        identifier: string,
        limit: number,
        windowMs: number,
    ): Promise<RateLimitDecision> {
        const now = Date.now();
        const windowSeconds = Math.ceil(windowMs / 1000);
        const key = `ratelimit:${identifier}`;

        try {
            const results = await this.redis.multi().incr(key).pttl(key).exec();
            if (!results) throw new Error("Redis transaction failed");

            const countResult = results[0];
            const ttlResult = results[1];
            if (countResult[0]) throw countResult[0];
            if (ttlResult[0]) throw ttlResult[0];

            const count = countResult[1] as number;
            let ttl = ttlResult[1] as number;

            if (count === 1 || ttl === -1) {
                await this.redis.pexpire(key, windowMs);
                ttl = windowMs;
            }

            const resetTime = now + Math.max(ttl, 0);
            const remaining = Math.max(0, limit - count);

            return { allowed: count <= limit, remaining, resetTime };
        } catch (error) {
            logger.error({ error, identifier }, "Redis rate limit check failed, falling back to in-memory limiter");
            return this.fallback.check(identifier, limit, windowMs);
        }
    }

    destroy(): void {
        // Redis handles connections automatically
    }
}

let cached: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
    if (cached) return cached;
    const skipRedis = process.env.SKIP_REDIS_CHECK === "1" || process.env.NODE_ENV === "test";
    if (skipRedis) {
        logger.warn("Using in-memory rate limiting (Redis skipped)");
        cached = new InMemoryRateLimiter();
        return cached;
    }
    try {
        const url = process.env.REDIS_URL || "redis://localhost:6379";
        const client: Redis = new Redis(url, {
            enableReadyCheck: false,
            maxRetriesPerRequest: 1,
            lazyConnect: true,
        });
        cached = new RedisRateLimiter(client);
        logger.info("Distributed rate limiting enabled (Redis)");
    } catch (e) {
        logger.warn({ error: e }, "Redis init failed — using in-memory rate limiting");
        cached = new InMemoryRateLimiter();
    }
    return cached;
}

export const rateLimiter: RateLimiter = getRateLimiter();
export const isDistributed = !(rateLimiter instanceof InMemoryRateLimiter);
