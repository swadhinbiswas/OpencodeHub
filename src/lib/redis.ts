import Redis from "ioredis";
import { logger } from "@/lib/logger";

const REDIS_DEFAULT_URL = "redis://localhost:6379";

function resolveRedisUrl(): string {
    return (
        process.env.REDIS_URL ||
        (typeof import.meta !== "undefined" ? import.meta.env?.REDIS_URL : undefined) ||
        REDIS_DEFAULT_URL
    );
}

function safeUrl(url: string): string {
    return url.replace(/:\/\/([^:@]+)(:[^@]+)?@/, "://$1:***@");
}

function shouldSkipRedis(): boolean {
    return process.env.SKIP_REDIS_CHECK === "1" || process.env.NODE_ENV === "test";
}

let client: Redis | null = null;
let connecting: Promise<Redis | null> | null = null;

function createClient(url: string): Redis {
    const instance: Redis = new Redis(url, {
        enableReadyCheck: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
    });
    instance.on("error", (error: Error) => {
        if (shouldSkipRedis()) return;
        logger.warn({ error }, "Redis connection error");
    });
    instance.on("connect", () => {
        if (shouldSkipRedis()) return;
        logger.info("Redis connected");
    });
    return instance;
}

async function connect(url: string): Promise<Redis | null> {
    if (client) return client;
    if (connecting) return connecting;
    connecting = (async () => {
        const instance = createClient(url);
        try {
            await instance.connect();
        } catch (e) {
            if (!shouldSkipRedis()) {
                logger.warn({ error: e }, "Redis initial connect failed; will retry in background");
            }
        } finally {
            connecting = null;
        }
        return instance;
    })();
    return connecting;
}

function readClient(): Redis | null {
    if (client) return client;
    const url = resolveRedisUrl();
    if (shouldSkipRedis()) {
        return null;
    }
    if (!client) {
        client = createClient(url);
        client.connect().catch((e: Error) => {
            if (!shouldSkipRedis()) {
                logger.warn({ error: e }, "Redis initial connect failed; will retry in background");
            }
        });
    }
    return client;
}

export const redis = new Proxy({} as Redis, {
    get(_target, prop) {
        const instance = readClient();
        if (!instance) {
            throw new Error("Redis is not configured (SKIP_REDIS_CHECK=1 or NODE_ENV=test)");
        }
        const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
    },
});

export async function waitForRedisReady(timeoutMs = 5000): Promise<boolean> {
    if (shouldSkipRedis()) return false;
    const url = resolveRedisUrl();
    const instance = await connect(url);
    if (!instance) return false;
    if (instance.status === "ready") return true;
    return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
            cleanup();
            resolve(false);
        }, timeoutMs);
        const onReady = () => {
            cleanup();
            resolve(true);
        };
        const onError = () => {
            // transient errors are common during startup; keep waiting
        };
        const cleanup = () => {
            clearTimeout(timeout);
            instance.off("ready", onReady);
            instance.off("error", onError);
        };
        instance.once("ready", onReady);
        instance.on("error", onError);
    });
}

export async function setSession(
    sessionId: string,
    data: unknown,
    ttl = 7 * 24 * 60 * 60,
): Promise<void> {
    const instance = readClient();
    if (!instance || instance.status !== "ready") return;
    try {
        await instance.setex(sessionId, ttl, JSON.stringify(data));
    } catch (e) {
        logger.error({ error: e }, "Failed to set session in Redis");
    }
}

export async function getSession<T = unknown>(sessionId: string): Promise<T | null> {
    const instance = readClient();
    if (!instance || instance.status !== "ready") return null;
    try {
        const data = await instance.get(sessionId);
        return data ? (JSON.parse(data) as T) : null;
    } catch (e) {
        logger.error({ error: e }, "Failed to get session from Redis");
        return null;
    }
}

export async function deleteSession(sessionId: string): Promise<void> {
    const instance = readClient();
    if (!instance || instance.status !== "ready") return;
    try {
        await instance.del(sessionId);
    } catch (e) {
        logger.error({ error: e }, "Failed to delete session in Redis");
    }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    try {
      await client.quit();
      logger.info("Redis connection closed");
    } catch {
      // Already disconnected
    }
    client = null;
  }
}

// log Redis configuration on module load only when actually used
if (!shouldSkipRedis()) {
    logger.info({ redisUrl: safeUrl(resolveRedisUrl()) }, "Redis configured");
}
