import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createHash, randomBytes } from "crypto";
import { generateId } from "@/lib/utils";

const CODE_TTL_MINUTES = 10;

/**
 * GET /api/oauth/authorize?client_id=&redirect_uri=&scope=&state=
 *   - Validates the app request
 *   - If the user is logged in, shows a consent page (or auto-approves
 *     when the requested scopes are a subset of the app's allowed scopes)
 * POST /api/oauth/authorize  { client_id, redirect_uri, state, approve }
 *   - Issues an authorization code and redirects
 */
export const GET: APIRoute = withErrorHandler(async ({ request, url }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const requestedScopes = (url.searchParams.get("scope") || "").split(" ").filter(Boolean);
  const state = url.searchParams.get("state") || "";

  if (!clientId || !redirectUri) return badRequest("client_id and redirect_uri are required");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const app = await db.query.oauthApps.findFirst({
    where: eq(schema.oauthApps.clientId, clientId),
  });
  if (!app) return badRequest("Unknown client_id");

  const allowedRedirects: string[] = JSON.parse(app.redirectUris);
  if (!allowedRedirects.includes(redirectUri)) {
    return badRequest("redirect_uri is not registered for this app");
  }

  const appScopes: string[] = app.scopes ? JSON.parse(app.scopes) : [];
  const scopeOk = requestedScopes.every((s: string) => appScopes.includes(s) || appScopes.includes("admin"));

  return new Response(
    `<!DOCTYPE html>
<html>
<head><title>Authorize ${app.name}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0b0f1a; color: #e2e8f0; display: flex; justify-content: center; padding-top: 8vh; }
  .card { background: #131a2b; border: 1px solid #243049; border-radius: 12px; padding: 32px; width: 420px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #94a3b8; font-size: 14px; }
  .scope { display: inline-block; background: #1e293b; border-radius: 6px; padding: 4px 10px; font-size: 12px; margin: 2px; font-family: monospace; }
  button { margin-top: 20px; padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; }
  .allow { background: #06b6d4; color: #0b0f1a; font-weight: 600; margin-right: 8px; }
  .deny { background: #1e293b; color: #94a3b8; }
</style></head>
<body>
  <form class="card" method="POST" action="/api/oauth/authorize">
    <input type="hidden" name="client_id" value="${clientId}" />
    <input type="hidden" name="redirect_uri" value="${redirectUri}" />
    <input type="hidden" name="state" value="${state}" />
    <input type="hidden" name="scope" value="${requestedScopes.join(" ")}" />
    <h1>Authorize ${app.name}</h1>
    <p><strong>${app.name}</strong> (by ${user.username}) is requesting access to your OpenCodeHub account.</p>
    <p>This app will be able to:</p>
    <div>${requestedScopes.map((s: string) => `<span class="scope">${s}</span>`).join("") || '<span class="scope">basic profile</span>'}</div>
    <p style="margin-top:16px">Redirect URI: <code>${redirectUri}</code></p>
    <button class="allow" name="approve" value="true" type="submit">Authorize</button>
    <button class="deny" name="approve" value="false" type="submit">Deny</button>
  </form>
</body>
</html>`,
    { headers: { "Content-Type": "text/html" } },
  );
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const form = await request.formData();
  const clientId = String(form.get("client_id") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const state = String(form.get("state") || "");
  const approve = form.get("approve") === "true";
  const requestedScopes = String(form.get("scope") || "").split(" ").filter(Boolean);

  if (!approve) {
    const sep = redirectUri.includes("?") ? "&" : "?";
    return new Response(null, {
      status: 302,
      headers: { Location: `${redirectUri}${sep}error=access_denied${state ? `&state=${encodeURIComponent(state)}` : ""}` },
    });
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const app = await db.query.oauthApps.findFirst({
    where: eq(schema.oauthApps.clientId, clientId),
  });
  if (!app) return badRequest("Unknown client_id");

  const allowedRedirects: string[] = JSON.parse(app.redirectUris);
  if (!allowedRedirects.includes(redirectUri)) return badRequest("redirect_uri not registered");

  // Issue a one-time authorization code (10 min TTL)
  const { generateAuthCode } = await import("@/lib/oauth-provider");
  const code = generateAuthCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

  await db.insert(schema.oauthAuthorizationCodes).values({
    id: generateId(),
    appId: app.id,
    userId: user.userId,
    codeHash: createHash("sha256").update(code).digest("hex"),
    redirectUri,
    scopes: JSON.stringify(requestedScopes),
    expiresAt,
  });

  logger.info({ userId: user.userId, appId: app.id, scopes: requestedScopes }, "OAuth code issued");
  const sep = redirectUri.includes("?") ? "&" : "?";
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${redirectUri}${sep}code=${code}${state ? `&state=${encodeURIComponent(state)}` : ""}`,
    },
  });
});
