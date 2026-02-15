/**
 * Runner Authentication Utilities
 * Token-based authentication for CI/CD runners
 */

import crypto from "crypto";
import { logger } from "./logger";

// Environment detection
const isProduction = import.meta.env.PROD || import.meta.env.NODE_ENV === "production";
// Validate RUNNER_SECRET
const configuredSecret = import.meta.env.RUNNER_SECRET;

if (isProduction && !configuredSecret) {
    throw new Error(
        "CRITICAL: RUNNER_SECRET environment variable is required in production. " +
        "Generate one with: openssl rand -hex 32"
    );
}

const RUNNER_SECRET = configuredSecret || crypto.randomBytes(32).toString("hex");

if (!isProduction && !configuredSecret) {
    logger.warn(
        "⚠️  RUNNER_SECRET not configured - using process-ephemeral secret. " +
        "Runner tokens will be invalidated on server restart. Set RUNNER_SECRET for stable and secure runner auth."
    );
}

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
 * Always enforces authentication - no bypass in any mode
 */
export function verifyRunnerToken(token: string | null | undefined, expectedRunId: string): boolean {
    if (!token) {
        logger.debug("Runner token verification failed: no token provided");
        return false;
    }

    try {
        const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
        const { runId, expires, sig } = decoded;

        // Check run ID matches
        if (runId !== expectedRunId) {
            logger.debug({ expected: expectedRunId, received: runId },
                "Runner token verification failed: run ID mismatch");
            return false;
        }

        // Check expiration
        if (Date.now() / 1000 > expires) {
            logger.debug({ runId, expiresAt: new Date(expires * 1000).toISOString() },
                "Runner token verification failed: token expired");
            return false;
        }

        // Verify signature
        const data = `${runId}:${expires}`;
        const expectedSig = crypto
            .createHmac("sha256", RUNNER_SECRET)
            .update(data)
            .digest("hex");

        const isValid = crypto.timingSafeEqual(
            Buffer.from(sig, "hex"),
            Buffer.from(expectedSig, "hex")
        );

        if (!isValid) {
            logger.debug({ runId }, "Runner token verification failed: invalid signature");
        }

        return isValid;
    } catch (error) {
        logger.debug({ error }, "Runner token verification failed: parse error");
        return false;
    }
}

/**
 * Check if runner authentication is properly configured
 */
export function isRunnerAuthConfigured(): boolean {
    return !!configuredSecret;
}
