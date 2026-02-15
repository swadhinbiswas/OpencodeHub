
import { rateLimiter } from "@/lib/rate-limit";

async function runTest() {
    console.log("Testing Rate Limiter...");
    const key = "test:user1";
    const limit = 5;
    const window = 60 * 1000;

    // Reset first
    // Note: In realRedis mode we'd need to manually del key, here we just assume clean slate or expiry

    console.log("Sending 5 requests (should allow)...");
    for (let i = 0; i < 5; i++) {
        const res = await rateLimiter.check(key, limit, window);
        console.log(`Req ${i + 1}: Allowed=${res.allowed}, Remaining=${res.remaining}`);
        if (!res.allowed) throw new Error("Should have allowed request within limit");
    }

    console.log("Sending 6th request (should block)...");
    const res = await rateLimiter.check(key, limit, window);
    console.log(`Req 6: Allowed=${res.allowed}, Remaining=${res.remaining}`);

    if (res.allowed) {
        console.error("FAILURE: Rate limiter did not block 6th request");
    } else {
        console.log("SUCCESS: Rate limiter blocked excess request");
    }
}

runTest().catch(console.error);
