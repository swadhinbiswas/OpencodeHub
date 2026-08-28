/**
 * Short-TTL in-memory cache for middleware auth lookups.
 *
 * The request pipeline resolves the full user row (and session row) on every
 * request — 2 DB queries per request under load. This cache absorbs that cost
 * with a small, bounded, short-TTL window. Revocation latency is therefore
 * bounded by AUTH_CACHE_TTL_MS; logout calls invalidateAuthCache for
 * immediate effect.
 *
 * Hit/miss outcomes are recorded via the cacheHits/cacheMisses Prometheus
 * counters from src/lib/metrics.ts.
 */
import { cacheHits, cacheMisses } from "@/lib/metrics";
import { logger } from "@/lib/logger";

const TTL_MS = Math.max(
  1000,
  parseInt(process.env.AUTH_CACHE_TTL_MS || "15000", 10),
);
const MAX_ENTRIES = 5000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const userCache = new Map<string, CacheEntry<unknown>>();
interface SessionCacheEntry extends CacheEntry<unknown> {
  ownerUserId?: string;
}
const sessionCache = new Map<string, SessionCacheEntry>();

function evictOldest(
  map: Map<string, CacheEntry<unknown> | SessionCacheEntry>,
): void {
  while (map.size >= MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function getCached(
  map: Map<string, CacheEntry<unknown>>,
  key: string,
): unknown | undefined {
  const entry = map.get(key);
  if (!entry) {
    cacheMisses.inc();
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    cacheMisses.inc();
    return undefined;
  }
  cacheHits.inc();
  return entry.value;
}

function setCached(
  map: Map<string, CacheEntry<unknown> | SessionCacheEntry>,
  key: string,
  value: unknown,
  ownerUserId?: string,
): void {
  evictOldest(map);
  map.set(key, {
    value,
    expiresAt: Date.now() + TTL_MS,
    ...(ownerUserId ? { ownerUserId } : {}),
  });
}

export async function cachedUserLookup<T>(
  userId: string,
  lookup: () => Promise<T | null>,
): Promise<T | null> {
  const hit = getCached(userCache, userId);
  if (hit !== undefined) return hit as T;
  const value = await lookup();
  if (value !== null && value !== undefined) {
    setCached(userCache, userId, value);
  }
  return value ?? null;
}

export async function cachedSessionLookup<T>(
  sessionId: string,
  lookup: () => Promise<T | null>,
): Promise<T | null> {
  const hit = getCached(sessionCache, sessionId);
  if (hit !== undefined) return hit as T;
  const value = await lookup();
  if (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    "userId" in (value as Record<string, unknown>)
  ) {
    setCached(
      sessionCache,
      sessionId,
      value,
      (value as { userId?: string }).userId,
    );
  }
  return value ?? null;
}

/** Invalidate all cached entries for a user (call on logout/password change). */
export function invalidateAuthCache(userId?: string, sessionId?: string): void {
  if (userId) userCache.delete(userId);
  if (sessionId) sessionCache.delete(sessionId);
  logger.debug({ userId, sessionId }, "Auth cache invalidated");
}

/**
 * Drop every cached session row owned by a user — used when all their
 * sessions are revoked server-side (password change/reset) so cached rows
 * cannot outlive the revocation for the TTL window.
 */
export function revokeUserSessionCache(userId: string): void {
  userCache.delete(userId);
  for (const [sessionId, entry] of sessionCache) {
    if (entry.ownerUserId === userId) sessionCache.delete(sessionId);
  }
  logger.debug({ userId }, "User session cache revoked");
}
