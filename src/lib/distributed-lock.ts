/**
 * Distributed Lock Utility
 * Uses Redis for distributed locking across multiple instances
 * Implements a simple lock with TTL and retry mechanism
 */

import { logger } from "./logger";

// Try to import Redis - may not be configured
let redis: any = null;
let redisAvailable = false;

try {
    const redisModule = await import("./redis");
    redis = redisModule.redis;
    // Test connection
    await redis.ping();
    redisAvailable = true;
} catch (e) {
    if (import.meta.env.PROD) {
        throw new Error("CRITICAL: Redis is required in production for distributed locking. Please configure REDIS_URL.");
    }
    logger.warn("Redis not available - distributed locks disabled. Using in-memory fallback. NOT SAFE for multi-instance deployments.");
}

export interface LockOptions {
    /** Lock timeout in seconds (default: 30) */
    ttlSeconds?: number;
    /** Retry attempts if lock is held (default: 10) */
    retryCount?: number;
    /** Delay between retries in ms (default: 100) */
    retryDelayMs?: number;
}

export interface Lock {
    key: string;
    token: string;
    release: () => Promise<boolean>;
}

/**
 * In-memory lock for single-instance deployments (fallback)
 */
class InMemoryLockManager {
    private locks: Map<string, { token: string; expiresAt: number }> = new Map();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Cleanup expired locks every 5 seconds
        this.cleanupInterval = setInterval(() => this.cleanup(), 5000);
    }

    private cleanup() {
        const now = Date.now();
        for (const [key, lock] of this.locks.entries()) {
            if (now > lock.expiresAt) {
                this.locks.delete(key);
            }
        }
    }

    async acquire(key: string, options: LockOptions = {}): Promise<Lock | null> {
        const {
            ttlSeconds = 30,
            retryCount = 10,
            retryDelayMs = 100,
        } = options;

        const token = crypto.randomUUID();
        const expiresAt = Date.now() + ttlSeconds * 1000;

        for (let attempt = 0; attempt <= retryCount; attempt++) {
            const existing = this.locks.get(key);

            if (!existing || Date.now() > existing.expiresAt) {
                this.locks.set(key, { token, expiresAt });

                return {
                    key,
                    token,
                    release: async () => {
                        const current = this.locks.get(key);
                        if (current?.token === token) {
                            this.locks.delete(key);
                            return true;
                        }
                        return false;
                    }
                };
            }

            if (attempt < retryCount) {
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            }
        }

        return null; // Failed to acquire lock
    }

    destroy() {
        clearInterval(this.cleanupInterval);
    }
}

/**
 * Redis-based distributed lock manager using SET NX with expiry
 */
class RedisLockManager {
    /**
     * Acquire a distributed lock
     * Uses SET NX (only set if not exists) with expiry for safety
     */
    async acquire(key: string, options: LockOptions = {}): Promise<Lock | null> {
        const {
            ttlSeconds = 30,
            retryCount = 10,
            retryDelayMs = 100,
        } = options;

        const lockKey = `lock:${key}`;
        const token = crypto.randomUUID();

        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                // SET key value NX EX seconds
                // NX = only set if not exists
                // EX = expire in seconds
                const result = await redis.set(lockKey, token, {
                    nx: true,
                    ex: ttlSeconds,
                });

                if (result === "OK") {
                    logger.debug({ key, token, ttl: ttlSeconds }, "Lock acquired");

                    return {
                        key,
                        token,
                        release: async () => {
                            return this.release(lockKey, token);
                        }
                    };
                }

                // Lock is held by someone else
                if (attempt < retryCount) {
                    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                }
            } catch (error) {
                logger.error({ error, key }, "Error acquiring lock");
                // On Redis error, we fail open (allow operation)
                // This is a trade-off between availability and consistency
                return {
                    key,
                    token: "fallback",
                    release: async () => true,
                };
            }
        }

        logger.warn({ key, attempts: retryCount + 1 }, "Failed to acquire lock after retries");
        return null;
    }

    /**
     * Release a lock only if we still own it
     * Uses Lua script for atomic check-and-delete
     */
    private async release(lockKey: string, token: string): Promise<boolean> {
        try {
            // Lua script for atomic check-and-delete
            // Only deletes if the value matches our token
            const script = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            `;

            const result = await redis.eval(script, [lockKey], [token]);
            const released = result === 1;

            logger.debug({ key: lockKey, released }, "Lock release attempt");
            return released;
        } catch (error) {
            logger.error({ error, key: lockKey }, "Error releasing lock");
            return false;
        }
    }

    destroy() {
        // Redis handles connections automatically with Upstash
    }
}

// Export the appropriate lock manager
const lockManager = redisAvailable ? new RedisLockManager() : new InMemoryLockManager();

export const isDistributedLocking = redisAvailable;

/**
 * Acquire a distributed lock
 * @param key - Unique key for the lock
 * @param options - Lock options (TTL, retries)
 * @returns Lock object with release function, or null if failed
 */
export async function acquireLock(key: string, options?: LockOptions): Promise<Lock | null> {
    return lockManager.acquire(key, options);
}

/**
 * Execute a function with a distributed lock
 * Automatically acquires and releases the lock
 * @param key - Unique key for the lock
 * @param fn - Function to execute while holding the lock
 * @param options - Lock options
 * @returns Result of the function, or throws if lock cannot be acquired
 */
export async function withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options?: LockOptions
): Promise<T> {
    const lock = await acquireLock(key, options);

    if (!lock) {
        throw new Error(`Failed to acquire lock for key: ${key}`);
    }

    try {
        return await fn();
    } finally {
        await lock.release();
    }
}

export default lockManager;
