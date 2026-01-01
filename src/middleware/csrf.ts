/**
 * CSRF Protection Middleware
 * Protects against Cross-Site Request Forgery attacks
 * Uses double-submit cookie pattern for stateless operation
 */

import { nanoid } from "nanoid";

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
        const [name, value] = cookie.split("=");
        if (name === CSRF_COOKIE_NAME) {
            return decodeURIComponent(value);
        }
    }
    return null;
}

/**
 * Extract CSRF token from request headers or body
 */
function getCsrfTokenFromRequest(request: Request): string | null {
    // Check header first
    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    if (headerToken) return headerToken;

    // For form submissions, check _csrf form field (handled by consumer)
    return null;
}

/**
 * Validate CSRF token
 */
export function validateCsrfToken(request: Request): boolean {
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
    const requestToken = getCsrfTokenFromRequest(request);

    // Both must exist and match
    if (!cookieToken || !requestToken) {
        return false;
    }

    // Constant-time comparison to prevent timing attacks
    return timingSafeEqual(cookieToken, requestToken);
}

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return mismatch === 0;
}

/**
 * Create Set-Cookie header for CSRF token
 */
export function createCsrfCookie(token: string, secure: boolean = false): string {
    const maxAge = 86400; // 24 hours
    const sameSite = "Strict";

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
    if (!validateCsrfToken(request)) {
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

/**
 * Example usage in Astro component:
 * 
 * ---
 * import { getCsrfToken } from "@/middleware/csrf";
 * const { token } = getCsrfToken(Astro.request);
 * Astro.response.headers.set("Set-Cookie", getCsrfToken(Astro.request).cookie);
 * ---
 * 
 * <form method="POST">
 *   <input type="hidden" name="_csrf" value={token} />
 *   <!-- rest of form -->
 * </form>
 * 
 * Or for fetch requests:
 * fetch("/api/endpoint", {
 *   method: "POST",
 *   headers: {
 *     "X-CSRF-Token": token,
 *     "Content-Type": "application/json"
 *   },
 *   body: JSON.stringify(data)
 * })
 */
