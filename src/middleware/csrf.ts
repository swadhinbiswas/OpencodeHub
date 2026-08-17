/**
 * CSRF Protection Middleware
 * Protects against Cross-Site Request Forgery attacks
 * Uses double-submit cookie pattern for stateless operation
 */

import { nanoid } from "nanoid";
import { timingSafeEqual as nodeTimingSafeEqual } from "crypto";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generate a new CSRF token
 */
export function generateCsrfToken(): string {
    return nanoid(CSRF_TOKEN_LENGTH);
}

/**
 * Extract CSRF token from cookies
 */
function getCsrfTokenFromCookie(request: Request): string | null {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
        const eqIndex = cookie.indexOf("=");
        if (eqIndex === -1) continue;
        const name = cookie.substring(0, eqIndex).trim();
        const value = cookie.substring(eqIndex + 1).trim();
        if (name === CSRF_COOKIE_NAME) {
            try {
                return decodeURIComponent(value);
            } catch {
                return value;
            }
        }
    }
    return null;
}

/**
 * Extract CSRF token from request headers or body
 * Uses request.clone() to avoid consuming the body stream
 */
async function getCsrfTokenFromRequest(request: Request): Promise<string | null> {
    // Check header first
    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    if (headerToken) return headerToken;

    // For form submissions, check _csrf form field
    // Clone the request so we don't consume the body stream
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
        try {
            const cloned = request.clone();
            const body = await cloned.text();
            const params = new URLSearchParams(body);
            const formToken = params.get("_csrf");
            if (formToken) return formToken;
        } catch {
            // Ignore errors parsing body
        }
    }

    return null;
}

/**
 * Validate CSRF token
 */
export async function validateCsrfToken(request: Request): Promise<boolean> {
    // GET, HEAD, OPTIONS are safe methods - no CSRF protection needed
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        return true;
    }

    // Skip for internal hooks (they use different auth)
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/internal/")) {
        return true;
    }

    // Skip in development if configured
    if (
        process.env.NODE_ENV === "development" &&
        process.env.CSRF_SKIP_DEV === "true"
    ) {
        return true;
    }

    const cookieToken = getCsrfTokenFromCookie(request);
    const requestToken = await getCsrfTokenFromRequest(request);

    // Both must exist and match
    if (!cookieToken || !requestToken) {
        return false;
    }

    // Constant-time comparison to prevent timing attacks
    return timingSafeEqual(cookieToken, requestToken);
}

/**
 * Timing-safe string comparison using Node.js crypto
 * Pads both strings to a fixed length to prevent length leakage
 */
const COMPARISON_FIXED_LENGTH = 64;

function timingSafeEqual(a: string, b: string): boolean {
    const paddedA = a.padEnd(COMPARISON_FIXED_LENGTH, "\0");
    const paddedB = b.padEnd(COMPARISON_FIXED_LENGTH, "\0");
    const bufA = Buffer.from(paddedA, "utf8");
    const bufB = Buffer.from(paddedB, "utf8");
    return nodeTimingSafeEqual(bufA, bufB);
}

/**
 * Create Set-Cookie header for CSRF token
 */
export function createCsrfCookie(token: string, secure: boolean = false): string {
    const maxAge = 86400; // 24 hours
    // Use Lax instead of Strict — Strict cookies are not sent on same-site
    // form POSTs in some browser configurations, causing CSRF failures
    const sameSite = "Lax";

    return [
        `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
        `Max-Age=${maxAge}`,
        `Path=/`,
        `SameSite=${sameSite}`,
        `HttpOnly`,
        secure ? "Secure" : "",
    ]
        .filter(Boolean)
        .join("; ");
}

/**
 * CSRF middleware for Astro API routes
 */
export async function applyCsrfProtection(
    request: Request
): Promise<Response | null> {
    const isValid = await validateCsrfToken(request);
    if (!isValid) {
        return new Response(
            JSON.stringify({
                error: "CSRF token validation failed",
                message: "Invalid or missing CSRF token. Please refresh and try again.",
            }),
            {
                status: 403,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    }

    return null; // Continue to next handler
}

/**
 * Helper to get or create CSRF token for a request
 * Use this in page handlers to inject token into forms
 */
export function getCsrfToken(request: Request): { token: string; cookie: string } {
    let token = getCsrfTokenFromCookie(request);

    if (!token) {
        token = generateCsrfToken();
    }

    const isSecure = process.env.NODE_ENV === "production";
    const cookie = createCsrfCookie(token, isSecure);

    return { token, cookie };
}
