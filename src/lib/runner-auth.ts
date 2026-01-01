/**
 * Runner Authentication Utilities
 * Token-based authentication for CI/CD runners
 */

import crypto from "crypto";

const RUNNER_SECRET = import.meta.env.RUNNER_SECRET || crypto.randomBytes(32).toString("hex");

/**
 * Generate a runner token for a specific run
 */
export function generateRunnerToken(runId: string, expiresInSeconds: number = 7200): string {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const data = `${runId}:${expires}`;
    const signature = crypto
        .createHmac("sha256", RUNNER_SECRET)
        .update(data)
        .digest("hex");

    return Buffer.from(JSON.stringify({ runId, expires, sig: signature })).toString("base64");
}

/**
 * Verify a runner token
 */
export function verifyRunnerToken(token: string | null | undefined, expectedRunId: string): boolean {
    // If no secret configured, allow all (development mode)
    if (!import.meta.env.RUNNER_SECRET) {
        return true;
    }

    if (!token) return false;

    try {
        const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
        const { runId, expires, sig } = decoded;

        // Check run ID matches
        if (runId !== expectedRunId) return false;

        // Check expiration
        if (Date.now() / 1000 > expires) return false;

        // Verify signature
        const data = `${runId}:${expires}`;
        const expectedSig = crypto
            .createHmac("sha256", RUNNER_SECRET)
            .update(data)
            .digest("hex");

        return crypto.timingSafeEqual(
            Buffer.from(sig, "hex"),
            Buffer.from(expectedSig, "hex")
        );
    } catch {
        return false;
    }
}
