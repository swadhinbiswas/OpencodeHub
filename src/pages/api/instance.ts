import type { APIRoute } from "astro";
import { success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getSiteUrl } from "@/lib/site-url";

/**
 * GET /api/instance
 *
 * Public instance metadata. Allows a peer OpenCodeHub instance (or any
 * federated client) to discover this instance's identity and federation
 * capabilities before importing a repository or opening a cross-instance PR.
 */
export const GET: APIRoute = withErrorHandler(async () => {
  return success({
    product: "opencodehub",
    name: process.env.INSTANCE_NAME || "OpenCodeHub",
    siteUrl: getSiteUrl(),
    version: process.env.npm_package_version || "1.2.0",
    capabilities: ["git-http", "import", "mirror", "external-pulls", "push-upstream"],
  });
});
