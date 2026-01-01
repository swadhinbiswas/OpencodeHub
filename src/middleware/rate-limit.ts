/**
 * Rate Limiting Middleware
 * Prevents brute force attacks and DoS by limiting requests per IP
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

class RateLimiter {
    private store: Map<string, RateLimitEntry> = new Map();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Cleanup expired entries every 60 seconds
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }

    private cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (now > entry.resetTime) {
                this.store.delete(key);
            }
        }
    }

    check(
        identifier: string,
        limit: number,
        windowMs: number
    ): { allowed: boolean; remaining: number; resetTime: number } {
        const now = Date.now();
        const entry = this.store.get(identifier);

        if (!entry || now > entry.resetTime) {
            // New window
            const resetTime = now + windowMs;
            this.store.set(identifier, { count: 1, resetTime });
            return { allowed: true, remaining: limit - 1, resetTime };
        }

        if (entry.count >= limit) {
            // Limit exceeded
            return { allowed: false, remaining: 0, resetTime: entry.resetTime };
        }

        // Increment count
        entry.count++;
        this.store.set(identifier, entry);
        return {
            allowed: true,
            remaining: limit - entry.count,
            resetTime: entry.resetTime,
        };
    }

    destroy() {
        clearInterval(this.cleanupInterval);
    }
}

// Singleton instance
const rateLimiter = new RateLimiter();

// Rate limit configurations
export const RATE_LIMITS = {
    // Authentication endpoints - stricter limits
    auth: {
        limit: parseInt(process.env.RATE_LIMIT_AUTH || "5"),
        windowMs: 15 * 60 * 1000, // 15 minutes
    },
    // API endpoints - moderate limits
    api: {
        limit: parseInt(process.env.RATE_LIMIT_API || "100"),
        windowMs: 60 * 1000, // 1 minute
    },
    // Git operations - higher limits
    git: {
        limit: parseInt(process.env.RATE_LIMIT_GIT || "200"),
        windowMs: 60 * 1000, // 1 minute
    },
    // General requests
    general: {
        limit: parseInt(process.env.RATE_LIMIT_GENERAL || "60"),
        windowMs: 60 * 1000, // 1 minute
    },
};

/**
 * Get client identifier from request
 * Uses IP address, falling back to forwarded headers
 */
function getClientIdentifier(request: Request): string {
    // Check X-Forwarded-For header (if behind proxy)
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    // Check X-Real-IP header
    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
        return realIp;
    }

    // Fallback to connection remote address (if available in context)
    return "unknown";
}

/**
 * Rate limiting middleware factory
 * @param tier - The rate limit tier to use (auth, api, git, general)
 * @param customLimit - Optional custom limit override
 */
export function createRateLimitMiddleware(
    tier: keyof typeof RATE_LIMITS = "general",
    customLimit?: { limit: number; windowMs: number }
) {
    const config = customLimit || RATE_LIMITS[tier];

    return async (request: Request, context?: any): Promise<Response | null> => {
        // Skip rate limiting in development if configured
        if (
            process.env.NODE_ENV === "development" &&
            process.env.RATE_LIMIT_SKIP_DEV === "true"
        ) {
            return null; // Continue to next handler
        }

        const identifier = getClientIdentifier(request);
        const key = `${tier}:${identifier}`;

        const result = rateLimiter.check(key, config.limit, config.windowMs);

        // Set rate limit headers
        const headers = new Headers({
            "X-RateLimit-Limit": config.limit.toString(),
            "X-RateLimit-Remaining": result.remaining.toString(),
            "X-RateLimit-Reset": new Date(result.resetTime).toISOString(),
        });

        if (!result.allowed) {
            const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
            headers.set("Retry-After", retryAfter.toString());

            return new Response(
                JSON.stringify({
                    error: "Too many requests",
                    message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
                }),
                {
                    status: 429,
                    headers: {
                        ...Object.fromEntries(headers),
                        "Content-Type": "application/json",
                    },
                }
            );
        }

        // Attach headers to context for later use
        if (context) {
            context.rateLimitHeaders = headers;
        }

        return null; // Continue to next handler
    };
}

/**
 * Helper to apply rate limit to Astro API routes
 */
export async function applyRateLimit(
    request: Request,
    tier: keyof typeof RATE_LIMITS = "api"
): Promise<Response | null> {
    const middleware = createRateLimitMiddleware(tier);
    return middleware(request);
}

export default rateLimiter;
