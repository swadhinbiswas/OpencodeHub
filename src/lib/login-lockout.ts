import { logger } from "@/lib/logger";
import { isDistributed } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";

const USER_KEY_PREFIX = "u:";
const IP_KEY_PREFIX = "i:";
const REDIS_KEY_PREFIX = "login-lockout:";

const USER_IP_MAX_FAILURES = 5;
const IP_MAX_FAILURES = 20;
const FAILURE_WINDOW_MS = 15 * 60_000;
const BASE_LOCKOUT_MS = 15 * 60_000;
const MAX_LOCKOUT_MS = 24 * 60 * 60_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;
const MAX_MEMORY_ENTRIES = 10_000;

export interface LockoutStatus {
    locked: boolean;
    retryAfterSecs?: number;
}

interface LockoutEntry {
    failures: number;
    windowStart: number;
    lockedUntil: number;
    lockoutCount: number;
}

interface LockoutStore {
    get(identifier: string): Promise<LockoutEntry | null>;
    set(identifier: string, entry: LockoutEntry, ttlMs: number): Promise<void>;
    delete(identifier: string): Promise<void>;
}

class InMemoryLockoutStore implements LockoutStore {
    private store: Map<string, LockoutEntry> = new Map();

    constructor() {
        setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS).unref();
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [identifier, entry] of this.store.entries()) {
            if (
                entry.lockedUntil < now &&
                now - entry.windowStart > FAILURE_WINDOW_MS
            ) {
                this.store.delete(identifier);
            }
        }
    }

    async get(identifier: string): Promise<LockoutEntry | null> {
        return this.store.get(identifier) ?? null;
    }

    async set(identifier: string, entry: LockoutEntry): Promise<void> {
        this.store.delete(identifier);
        this.store.set(identifier, entry);
        while (this.store.size > MAX_MEMORY_ENTRIES) {
            const oldest = this.store.keys().next().value;
            if (oldest === undefined) break;
            this.store.delete(oldest);
        }
    }

    async delete(identifier: string): Promise<void> {
        this.store.delete(identifier);
    }
}

class RedisLockoutStore implements LockoutStore {
    constructor(private readonly fallback: InMemoryLockoutStore) {}

    async get(identifier: string): Promise<LockoutEntry | null> {
        try {
            const raw = await redis.get(`${REDIS_KEY_PREFIX}${identifier}`);
            if (!raw) return null;
            return JSON.parse(raw) as LockoutEntry;
        } catch (error) {
            logger.error({ error, identifier }, "Redis login lockout read failed, falling back to in-memory store");
            return this.fallback.get(identifier);
        }
    }

    async set(identifier: string, entry: LockoutEntry, ttlMs: number): Promise<void> {
        try {
            await redis.set(
                `${REDIS_KEY_PREFIX}${identifier}`,
                JSON.stringify(entry),
                "PX",
                Math.ceil(ttlMs),
            );
            return;
        } catch (error) {
            logger.error({ error, identifier }, "Redis login lockout write failed, falling back to in-memory store");
        }
        await this.fallback.set(identifier, entry);
    }

    async delete(identifier: string): Promise<void> {
        try {
            await redis.del(`${REDIS_KEY_PREFIX}${identifier}`);
        } catch (error) {
            logger.error({ error, identifier }, "Redis login lockout delete failed");
        }
        await this.fallback.delete(identifier);
    }
}

export function normalizeLogin(value: string): string {
    return value.trim().toLowerCase();
}

export function userIpKey(login: string, ip: string | null | undefined): string {
    return `${USER_KEY_PREFIX}${normalizeLogin(login)}|${ip || "unknown"}`;
}

export function ipKey(ip: string | null | undefined): string {
    return `${IP_KEY_PREFIX}${ip || "unknown"}`;
}

function maxFailuresFor(identifier: string): number {
    return identifier.startsWith(IP_KEY_PREFIX)
        ? IP_MAX_FAILURES
        : USER_IP_MAX_FAILURES;
}

function ttlFor(entry: LockoutEntry, now: number): number {
    const windowRemaining = entry.windowStart + FAILURE_WINDOW_MS - now;
    const lockRemaining = entry.lockedUntil - now;
    return Math.max(Math.max(windowRemaining, lockRemaining), FAILURE_WINDOW_MS);
}

const memoryStore = new InMemoryLockoutStore();
const store: LockoutStore = isDistributed
    ? new RedisLockoutStore(memoryStore)
    : memoryStore;

export async function recordLoginFailure(identifier: string): Promise<void> {
    const now = Date.now();
    const entry = (await store.get(identifier)) ?? {
        failures: 0,
        windowStart: now,
        lockedUntil: 0,
        lockoutCount: 0,
    };

    if (entry.lockedUntil > now) {
        return;
    }

    if (now - entry.windowStart > FAILURE_WINDOW_MS) {
        entry.windowStart = now;
        entry.failures = 0;
    }

    entry.failures += 1;

    if (entry.failures >= maxFailuresFor(identifier)) {
        entry.lockoutCount += 1;
        const lockMs = Math.min(
            BASE_LOCKOUT_MS * 2 ** (entry.lockoutCount - 1),
            MAX_LOCKOUT_MS,
        );
        entry.lockedUntil = now + lockMs;
        entry.failures = 0;
        logger.warn({ identifier }, "Login lockout triggered");
    }

    await store.set(identifier, entry, ttlFor(entry, now));
}

export async function clearLoginFailures(identifier: string): Promise<void> {
    await store.delete(identifier);
}

export async function isLockedOut(identifier: string): Promise<LockoutStatus> {
    const now = Date.now();
    const entry = await store.get(identifier);
    if (!entry || entry.lockedUntil <= now) {
        return { locked: false };
    }
    return {
        locked: true,
        retryAfterSecs: Math.ceil((entry.lockedUntil - now) / 1000),
    };
}
