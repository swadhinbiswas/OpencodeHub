
import { logger } from "@/lib/logger";
import { RATE_LIMITS } from "@/lib/rate-limit-config";
import { rateLimiter, isDistributed } from "@/lib/rate-limit";

/**
 * Get client identifier from request
 * Uses Astro clientAddress, then forwarded headers
 */
function getClientIdentifier(request: Request, context?: { clientAddress?: string }): string {
    if (context?.clientAddress && context.clientAddress !== "unknown") {
        return context.clientAddress;
    }

    // Check X-Forwarded-For header (if behind proxy)
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        // Take the first IP in the chain (original client)
        const ip = forwarded.split(",")[0].trim();
        // Validate it looks like an IP
        if (ip && ip.length > 0 && ip !== "unknown") {
            return ip;
        }
    }

    // Check X-Real-IP header
    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
        return realIp;
    }

    // Check CF-Connecting-IP (Cloudflare)
    const cfIp = request.headers.get("cf-connecting-ip");
    if (cfIp) {
        return cfIp;
    }

    // Vercel/Fly.io headers
    const vercelIp = request.headers.get("x-vercel-forwarded-for");
    if (vercelIp) {
        return vercelIp.split(",")[0].trim();
    }
    const flyIp = request.headers.get("fly-client-ip");
    if (flyIp) {
        return flyIp;
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

        const identifier = getClientIdentifier(request, context);
        const key = `${tier}:${identifier}`;

        const result = await rateLimiter.check(key, config.limit, config.windowMs);

        // Set rate limit headers
        const headers = new Headers({
            "X-RateLimit-Limit": config.limit.toString(),
            "X-RateLimit-Remaining": result.remaining.toString(),
            "X-RateLimit-Reset": new Date(result.resetTime).toISOString(),
            "X-RateLimit-Policy": isDistributed ? "distributed" : "per-instance",
        });

        if (!result.allowed) {
            const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
            headers.set("Retry-After", retryAfter.toString());

            logger.warn({
                identifier,
                tier,
                limit: config.limit,
                resetTime: result.resetTime
            }, "Rate limit exceeded");

            return new Response(
                JSON.stringify({
                    error: "Too many requests",
                    message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
                    retryAfter,
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
            context.request.headers.append("X-RateLimit-Limit", headers.get("X-RateLimit-Limit")!);
            context.request.headers.append("X-RateLimit-Remaining", headers.get("X-RateLimit-Remaining")!);
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
