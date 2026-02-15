
import { describe, it, expect, vi } from "vitest";
import { acquireLock, withLock, isDistributedLocking } from "@/lib/distributed-lock";

// We can mock the lock manager internally if we want, but testing the public API is better.
// Since we might be running in an environment without Redis, we expect InMemory behavior by default
// unless we mock the redis import.

describe("Distributed Locking", () => {
    it("should acquire and release a lock", async () => {
        const key = "test-lock-1";
        const lock = await acquireLock(key);

        expect(lock).toBeDefined();
        expect(lock?.key).toBe(key);
        expect(lock?.token).toBeDefined();

        const released = await lock?.release();
        expect(released).toBe(true);
    });

    it("should prevent acquiring a held lock", async () => {
        const key = "test-lock-2";
        // Acquire first lock
        const lock1 = await acquireLock(key);
        expect(lock1).toBeDefined();

        // Try to acquire same lock with no retries to avoid timing-based flakiness.
        const lock2 = await acquireLock(key, { retryCount: 0 });

        expect(lock2).toBeNull();

        await lock1?.release();
    });

    it("should execute function within lock", async () => {
        const key = "test-lock-3";
        let executed = false;

        const result = await withLock(key, async () => {
            executed = true;
            return "success";
        });

        expect(result).toBe("success");
        expect(executed).toBe(true);

        // Lock should be released now, so we can acquire it again
        const lock = await acquireLock(key);
        expect(lock).toBeDefined();
        await lock?.release();
    });

    it("should release lock even if function throws", async () => {
        const key = "test-lock-4";

        try {
            await withLock(key, async () => {
                throw new Error("Test error");
            });
        } catch (e) {
            expect(e.message).toBe("Test error");
        }

        // Lock should be released
        const lock = await acquireLock(key);
        expect(lock).toBeDefined();
        await lock?.release();
    });
});
