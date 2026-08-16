import type { APIRoute } from "astro";
import { unauthorized, success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";

/**
 * GET /api/oauth/userinfo
 * Authorization: Bearer <access_token>
 * → { id, username, displayName, avatarUrl, email? }
 */
export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return unauthorized();

  const { verifyAccessToken } = await import("@/lib/oauth-provider");
  const payload = await verifyAccessToken(token);
  if (!payload) return unauthorized();

  const { getDatabase, schema } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  const db = getDatabase() as any;
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, payload.userId),
    columns: { id: true, username: true, displayName: true, avatarUrl: true, email: true },
  });
  if (!user) return unauthorized();

  return success({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    email: payload.scopes.includes("user:read") ? user.email : undefined,
  });
});
