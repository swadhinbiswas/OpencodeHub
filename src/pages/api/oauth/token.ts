import type { APIRoute } from "astro";
import { badRequest, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { consumeAuthorizationCode, issueAccessToken, issueRefreshToken } from "@/lib/oauth-provider";

/**
 * POST /api/oauth/token
 * { grant_type: "authorization_code", code, client_id, client_secret, redirect_uri }
 * → { access_token, token_type: "bearer", expires_in, scope }
 */
export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const body = await request.json().catch(() => null);

  const get = (key: string) =>
    String(form?.get(key) ?? body?.[key] ?? "");

  const grantType = get("grant_type") || "authorization_code";
  const clientId = get("client_id");
  const clientSecret = get("client_secret");

  // ── refresh_token grant: exchange a valid refresh token for a new
  // access token (and rotate the refresh token) ─────────────────────────
  if (grantType === "refresh_token") {
    const refreshToken = get("refresh_token");
    if (!refreshToken || !clientId || !clientSecret) {
      return badRequest("invalid_request");
    }
    const { verifyRefreshToken, issueAccessToken, issueRefreshToken } = await import(
      "@/lib/oauth-provider"
    );
    const claims = await verifyRefreshToken(refreshToken);
    if (!claims) {
      return new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "Invalid or expired refresh token" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { getDatabase, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const db = getDatabase() as any;
    const app = await db.query.oauthApps.findFirst({
      where: eq(schema.oauthApps.clientId, clientId),
    });
    if (!app || app.clientSecretHash !== (await import("@/lib/oauth-provider")).hashClientSecret(clientSecret)) {
      return new Response(
        JSON.stringify({ error: "invalid_client", error_description: "Client credentials invalid" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const newAccess = await issueAccessToken({
      userId: claims.userId,
      appId: claims.appId,
      scopes: claims.scopes,
    });
    const newRefresh = await issueRefreshToken({
      userId: claims.userId,
      appId: claims.appId,
      scopes: claims.scopes,
    });
    logger.info({ appId: claims.appId, userId: claims.userId }, "OAuth token refreshed");
    return success({
      access_token: newAccess,
      refresh_token: newRefresh,
      token_type: "bearer",
      expires_in: 3600,
      scope: claims.scopes.join(" "),
    });
  }

  if (grantType !== "authorization_code") {
    return badRequest("unsupported_grant_type");
  }

  const code = get("code");
  const redirectUri = get("redirect_uri");
  if (!code || !clientId || !clientSecret || !redirectUri) {
    return badRequest("invalid_request");
  }

  const result = await consumeAuthorizationCode({
    code,
    clientId,
    clientSecret,
    redirectUri,
  });
  if (!result) {
    return new Response(
      JSON.stringify({ error: "invalid_grant", error_description: "Invalid or expired authorization code" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const accessToken = await issueAccessToken({
    userId: result.userId,
    appId: result.appId,
    scopes: result.scopes,
  });
  const refreshToken = await issueRefreshToken({
    userId: result.userId,
    appId: result.appId,
    scopes: result.scopes,
  });

  logger.info({ appId: result.appId, userId: result.userId }, "OAuth token issued");

  return success({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: 3600,
    scope: result.scopes.join(" "),
  });
});

/**
 * GET /api/oauth/userinfo
 * Authorization: Bearer <access_token>
 * → { id, username, displayName, avatarUrl }
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
