/**
 * Distributed Lock Utility
 * Uses Redis for distributed locking across multiple instances
 * Implements a simple lock with TTL and retry mechanism
 */

import Redis from "ioredis";
import { logger } from "./logger";

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
    fencingToken: number;
    release: () => Promise<boolean>;
}

export interface LockManager {
    acquire(key: string, options?: LockOptions): Promise<Lock | null>;
    destroy(): void;
}

let globalFencingToken = 0;

function nextFencingToken(): number {
  return ++globalFencingToken;
}

class InMemoryLockManager implements LockManager {
    private locks: Map<string, { token: string; expiresAt: number }> = new Map();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        this.cleanupInterval = setInterval(() => this.cleanup(), 5000);
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [key, lock] of this.locks.entries()) {
            if (now > lock.expiresAt) {
                this.locks.delete(key);
            }
        }
    }

    async acquire(key: string, options: LockOptions = {}): Promise<Lock | null> {
        const { ttlSeconds = 30, retryCount = 10, retryDelayMs = 100 } = options;
        const token = crypto.randomUUID();
        const fencingToken = nextFencingToken();
        const expiresAt = Date.now() + ttlSeconds * 1000;

        for (let attempt = 0; attempt <= retryCount; attempt++) {
            const existing = this.locks.get(key);
            if (!existing || Date.now() > existing.expiresAt) {
                this.locks.set(key, { token, expiresAt });
                return {
                    key,
                    token,
                    fencingToken,
                    release: async () => {
                        const current = this.locks.get(key);
                        if (current?.token === token) {
                            this.locks.delete(key);
                            return true;
                        }
                        return false;
                    },
                };
            }
            if (attempt < retryCount) {
                await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            }
        }
        return null;
    }

    destroy(): void {
        clearInterval(this.cleanupInterval);
    }
}

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

const FENCING_SCRIPT = `
local current = redis.call("get", KEYS[1])
if current then
    local curToken = tonumber(current)
    local reqToken = tonumber(ARGV[2])
    if curToken and reqToken and reqToken >= curToken then
        redis.call("set", KEYS[1], ARGV[2], "EX", ARGV[3], "NX")
        return 1
    end
    return 0
else
    redis.call("set", KEYS[1], ARGV[2], "EX", ARGV[3])
    return 1
end
`;

class RedisLockManager implements LockManager {
    constructor(private readonly redis: Redis) {}

    async acquire(key: string, options: LockOptions = {}): Promise<Lock | null> {
        const { ttlSeconds = 30, retryCount = 10, retryDelayMs = 100 } = options;
        const lockKey = `lock:${key}`;
        const token = String(nextFencingToken());

        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                const result = await this.redis.set(lockKey, token, "EX", ttlSeconds, "NX");
                if (result === "OK") {
                    logger.debug({ key, fencingToken: token, ttl: ttlSeconds }, "Lock acquired");
                    return {
                        key,
                        token,
                        fencingToken: Number(token),
                        release: async () => this.release(lockKey, token),
                    };
                }
                if (attempt < retryCount) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                }
            } catch (error) {
                logger.error({ error, key }, "Error acquiring lock");
                return {
                    key,
                    token: "fallback",
                    fencingToken: 0,
                    release: async () => true,
                };
            }
        }
        logger.warn({ key, attempts: retryCount + 1 }, "Failed to acquire lock after retries");
        return null;
    }

    private async release(lockKey: string, token: string): Promise<boolean> {
        try {
            const result = await this.redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
            const released = result === 1;
            logger.debug({ key: lockKey, released }, "Lock release attempt");
            return released;
        } catch (error) {
            logger.error({ error, key: lockKey }, "Error releasing lock");
            return false;
        }
    }

    destroy(): void {
        // Redis handles connections automatically
    }
}

let cached: LockManager | null = null;

function getManager(): LockManager {
    if (cached) return cached;
    const skipRedis = process.env.SKIP_REDIS_CHECK === "1" || process.env.NODE_ENV === "test";
    if (skipRedis) {
        logger.warn("Using in-memory lock manager (Redis skipped). NOT SAFE for multi-instance deployments.");
        cached = new InMemoryLockManager();
        return cached;
    }
    try {
        const url = process.env.REDIS_URL || "redis://localhost:6379";
        const client: Redis = new Redis(url, {
            enableReadyCheck: false,
            maxRetriesPerRequest: 1,
            lazyConnect: true,
        });
        cached = new RedisLockManager(client);
    } catch (e) {
        logger.warn({ error: e }, "Redis init failed — using in-memory lock manager");
        cached = new InMemoryLockManager();
    }
    return cached;
}

const lockManager = getManager();

export const isDistributedLocking = !(lockManager instanceof InMemoryLockManager);

export async function acquireLock(key: string, options?: LockOptions): Promise<Lock | null> {
    return lockManager.acquire(key, options);
}

export async function withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options?: LockOptions,
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
