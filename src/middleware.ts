
import { defineMiddleware } from "astro:middleware";
import { createRateLimitMiddleware } from "./middleware/rate-limit";

// Define tiers for different routes
const apiLimiter = createRateLimitMiddleware("api");
const authLimiter = createRateLimitMiddleware("auth");

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;

  // Apply rate limiting to API routes
  if (url.pathname.startsWith("/api/")) {
    // Use stricter auth limits for auth routes
    if (url.pathname.startsWith("/api/auth")) {
      const response = await authLimiter(request, context);
      if (response) return response;
    } else {
      const response = await apiLimiter(request, context);
      if (response) return response;
    }
  }

  // Continue to next middleware/route
  const response = await next();
  return response;
});
