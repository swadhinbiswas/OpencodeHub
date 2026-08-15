/**
 * Per-request context (correlation IDs).
 *
 * Every request runs inside an AsyncLocalStorage scope carrying a
 * requestId (+ userId when authenticated). The logger binds these onto
 * every log line, so a single request's logs can be traced end-to-end
 * through DB, git, and CI operations.
 *
 * `node:async_hooks` is initialized ONCE at server boot (middleware calls
 * ensureRequestStorage); after that all reads are synchronous. The dynamic
 * import keeps the Vite browser build from choking on the node builtin.
 */
import type { AsyncLocalStorage as AsyncLocalStorageType } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  userId?: string;
  route?: string;
}

let storageImpl: AsyncLocalStorageType<RequestContext> | null = null;
let storagePromise: Promise<void> | null = null;

/** Initialize the ALS storage once (server boot). Safe to call repeatedly. */
export function ensureRequestStorage(): Promise<void> {
  if (storageImpl) return Promise.resolve();
  if (!storagePromise) {
    storagePromise = import("node:async_hooks")
      .then((mod) => {
        storageImpl = new mod.AsyncLocalStorage<RequestContext>();
      })
      .catch((err) => {
        storagePromise = null;
        // In browser bundles this import never resolves — fail soft
        console.error("[request-context] async_hooks init failed", err);
      });
  }
  return storagePromise;
}

/** Sync accessor — valid only after ensureRequestStorage resolved. */
export function getRequestContext(): RequestContext | undefined {
  return storageImpl?.getStore();
}

export function withRequestContext<T>(
  ctx: RequestContext,
  fn: () => T,
): T {
  if (!storageImpl) return fn(); // not initialized (browser/test) — passthrough
  return storageImpl.run(ctx, fn);
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID().slice(0, 18)}`;
}
