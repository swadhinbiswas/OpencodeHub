import { Redis } from "@upstash/redis";
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = (
    process.env.UPSTASH_REDIS_REST_URL ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.UPSTASH_REDIS_REST_URL) ||
    ""
  ).trim();
  const token = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.UPSTASH_REDIS_REST_TOKEN) ||
    ""
  ).trim();
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}
const mem = new Map<string, {v:any; exp:number}>();
export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (r) { try { const v = await r.get<T>(key); if (v) return v as T; } catch {} }
  const m = mem.get(key);
  if (m && m.exp > Date.now()) return m.v as T;
  if (m) mem.delete(key);
  return null;
}
export async function cacheSet(key: string, value: any, ttlSec = 300) {
  const r = getRedis();
  if (r) { try { await r.set(key, value, { ex: ttlSec }); } catch {} }
  mem.set(key, { v: value, exp: Date.now() + ttlSec*1000 });
  if (mem.size > 500) { const k = mem.keys().next().value; if(k) mem.delete(k); }
}
export async function cacheInvalidate(pattern: string) {
  const r = getRedis();
  if (r) { try { const keys = await r.keys(pattern); if(keys.length) await r.del(...keys); } catch {} }
  for (const k of [...mem.keys()]) if (k.includes(pattern.replace("*",""))) mem.delete(k);
}
