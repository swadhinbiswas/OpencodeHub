import { register } from "@/lib/metrics";
import type { APIRoute } from "astro";
import { withErrorHandler } from "@/lib/errors";

export const GET: APIRoute = withErrorHandler(async () => {
  const metrics = await register.metrics();
  return new Response(metrics, {
    headers: {
      "Content-Type": register.contentType,
    },
  });
});
