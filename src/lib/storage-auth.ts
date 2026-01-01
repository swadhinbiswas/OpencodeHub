/**
 * Storage Authentication Utilities
 * HMAC-based signature verification for secure storage access
 */

import crypto from "crypto";

const STORAGE_SECRET = import.meta.env.STORAGE_SECRET || crypto.randomBytes(32).toString("hex");

/**
 * Generate a signed URL for storage access
 */
export function generateStorageSignature(key: string, expiresInSeconds: number = 3600): { signature: string; expires: string } {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const expiresStr = expires.toString();

    const data = `${key}:${expiresStr}`;
    const signature = crypto
        .createHmac("sha256", STORAGE_SECRET)
        .update(data)
        .digest("hex");

    return { signature, expires: expiresStr };
}

/**
 * Verify a storage access signature
 */
export function verifyStorageSignature(key: string, signature: string | null, expires: string | null): boolean {
    // If no secret configured, allow public access (development mode)
    if (!import.meta.env.STORAGE_SECRET) {
        return true;
    }

    if (!signature || !expires) {
        return false;
    }

    // Check expiration
    const expiresTime = parseInt(expires, 10);
    if (isNaN(expiresTime) || Date.now() / 1000 > expiresTime) {
        return false;
    }

    // Verify signature
    const data = `${key}:${expires}`;
    const expectedSignature = crypto
        .createHmac("sha256", STORAGE_SECRET)
        .update(data)
        .digest("hex");

    return crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex")
    );
}

/**
 * Generate a signed storage URL
 */
export function getSignedStorageUrl(key: string, baseUrl: string = "", expiresIn: number = 3600): string {
    const { signature, expires } = generateStorageSignature(key, expiresIn);
    return `${baseUrl}/api/storage/${encodeURIComponent(key)}?sig=${signature}&exp=${expires}`;
}
