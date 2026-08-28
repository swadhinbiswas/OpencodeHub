import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Redis from "ioredis";

/**
 * Cross-process realtime bridge tests.
 *
 * Two "processes" are simulated with fresh module registries
 * (vi.resetModules + dynamic import): each import gets its own connections
 * Map and originId, so messages between them genuinely travel through Redis
 * pub/sub on the och:realtime channel.
 *
 * Requires a live Redis (see TEST_REALTIME_REDIS_URL). When unreachable the
 * suite skips — the bridge degrades to local-only delivery in that case,
 * which is covered by the local-delivery test running without redis.
 */

const TEST_REDIS_URL = process.env.TEST_REALTIME_REDIS_URL || "redis://127.0.0.1:16379";

async function probeRedis(url: string, timeoutMs = 1000): Promise<boolean> {
    try {
        const client = new Redis(url, { lazyConnect: true, connectTimeout: timeoutMs });
        await client.connect();
        client.disconnect();
        return true;
    } catch {
        return false;
    }
}

const redisAvailable = await probeRedis(TEST_REDIS_URL);

interface ReceivedEvent {
    type: string;
    timestamp: unknown;
    data: unknown;
}

function makeFakeController(received: ReceivedEvent[]) {
    return {
        enqueue(chunk: Uint8Array) {
            const text = new TextDecoder().decode(chunk);
            const match = text.match(/^data: (.*)\n\n$/);
            if (match) received.push(JSON.parse(match[1]));
        },
        close() {},
    } as unknown as ReadableStreamDefaultController<Uint8Array>;
}

/** Drop the initial connection-confirmation event emitted by registerConnection */
function dataEvents(received: ReceivedEvent[]): ReceivedEvent[] {
    return received.filter((e) => !(e.type === "inbox:refresh" && (e.data as { connected?: boolean })?.connected));
}

async function loadRealtime() {
    return import("@/lib/realtime");
}

describe("realtime redis bridge", () => {
    let warnCalls = 0;

    beforeEach(() => {
        vi.resetModules();
        vi.doMock("@/lib/logger", () => ({
            logger: {
                info: vi.fn(),
                warn: vi.fn((msg: unknown) => {
                    if (String(msg).includes("Realtime Redis bridge")) warnCalls++;
                }),
                error: vi.fn(),
                debug: vi.fn(),
            },
        }));
        warnCalls = 0;
        process.env.NODE_ENV = "development";
        process.env.REDIS_URL = TEST_REDIS_URL;
    });

    afterEach(() => {
        vi.doUnmock("@/lib/logger");
        vi.resetModules();
    });

    it("delivers locally exactly once when broadcasting (no self-loop double delivery)", async () => {
        const rt = await loadRealtime();
        const received: ReceivedEvent[] = [];
        rt.registerConnection("user-1", makeFakeController(received), ["repo-1"]);
        // allow the fire-and-forget subscription to settle before publishing
        await new Promise((r) => setTimeout(r, 300));

        const sent = rt.broadcastToRepository("repo-1", {
            type: "pr:opened",
            timestamp: new Date(),
            data: { prId: "p1" },
        });

        expect(sent).toBe(1);
        await new Promise((r) => setTimeout(r, 400));
        expect(dataEvents(received)).toHaveLength(1);
        expect(dataEvents(received)[0].type).toBe("pr:opened");
    }, 15000);

    it("degrades to local-only without throwing when redis is unreachable", async () => {
        process.env.REDIS_URL = "redis://127.0.0.1:59999";
        const rt = await loadRealtime();
        const received: ReceivedEvent[] = [];
        rt.registerConnection("user-3", makeFakeController(received), []);

        for (let i = 0; i < 5; i++) {
            const sent = rt.broadcastToAll({
                type: "pr:updated",
                timestamp: new Date(),
                data: { i },
            });
            expect(sent).toBe(1);
        }

        await new Promise((r) => setTimeout(r, 500));
        expect(dataEvents(received)).toHaveLength(5);
        expect(warnCalls).toBeLessThanOrEqual(1);
    }, 15000);

    describe.skipIf(!redisAvailable)("with redis reachable", () => {
        it("relays events from a second instance through redis", async () => {
            const receiverRt = await loadRealtime();
            const received: ReceivedEvent[] = [];
            receiverRt.registerConnection("user-2", makeFakeController(received), ["repo-9"]);
            await new Promise((r) => setTimeout(r, 300));

            // simulate the worker process: fresh registry, no local connections
            vi.resetModules();
            const workerRt = await loadRealtime();

            const publishedAt = new Date("2026-01-02T03:04:05.000Z");
            const published = await workerRt.publishRealtimeEvent(
                { kind: "repository", repositoryId: "repo-9" },
                { type: "queue:position_changed", timestamp: publishedAt, data: { repositoryId: "repo-9" } }
            );
            expect(published).toBe(true);

            await new Promise((r) => setTimeout(r, 600));
            const match = dataEvents(received).find((e) => e.type === "queue:position_changed");
            expect(match).toBeDefined();
            expect(match!.data).toEqual({ repositoryId: "repo-9" });
            // timestamp must survive the JSON round-trip preserving the instant
            expect(new Date(match!.timestamp as string).toISOString()).toBe(publishedAt.toISOString());
        }, 15000);
    });
});


