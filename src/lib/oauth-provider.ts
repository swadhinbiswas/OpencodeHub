/**
 * OAuth Provider core (WS4-02)
 *
 * Authorization-code flow for third-party apps:
 *   register app → authorize (user consent) → code → token → userinfo
 */
import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";

export const OAUTH_SCOPES = [
  "user:read",
  "repo:read",
  "repo:write",
  "notifications",
] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export function hashClientSecret(secret: string): string {
  return createHash("sha256").update(`och-oauth:${secret}`).digest("hex");
}

export function generateClientCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  return {
    clientId: `och_oauth_${randomBytes(16).toString("hex")}`,
    clientSecret: randomBytes(32).toString("base64url"),
  };
}

export function generateAuthCode(): string {
  return randomBytes(32).toString("base64url");
}

function getJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET || (import.meta as any).env?.JWT_SECRET;
  if (!raw) throw new Error("JWT_SECRET environment variable is required");
  return new TextEncoder().encode(raw);
}

/**
 * Mint an OAuth access token (JWT) for a user + app.
 */
export async function issueAccessToken(options: {
  userId: string;
  appId: string;
  scopes: string[];
  expiresInSeconds?: number;
}): Promise<string> {
  const expiresIn = options.expiresInSeconds ?? 60 * 60; // 1h default
  return new SignJWT({
    sub: options.userId,
    type: "oauth_access",
    appId: options.appId,
    scopes: options.scopes,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${Math.floor(expiresIn / 60)}m`)
    .sign(getJwtSecret());
}

/**
 * Mint an OAuth refresh token (JWT, 30 days). Validated only by signature
 * + type; rotation is encouraged by issuing a new one on every refresh.
 */
export async function issueRefreshToken(options: {
  userId: string;
  appId: string;
  scopes: string[];
  expiresInSeconds?: number;
}): Promise<string> {
  const expiresIn = options.expiresInSeconds ?? 30 * 24 * 60 * 60; // 30d
  return new SignJWT({
    sub: options.userId,
    type: "oauth_refresh",
    appId: options.appId,
    scopes: options.scopes,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${Math.floor(expiresIn / 60)}m`)
    .sign(getJwtSecret());
}

export interface OAuthRefreshPayload {
  userId: string;
  appId: string;
  scopes: string[];
  valid: boolean;
}

/** Validate a refresh token and return its claims (no rotation here). */
export async function verifyRefreshToken(
  token: string,
): Promise<OAuthRefreshPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (payload.type !== "oauth_refresh" || !payload.sub || !payload.appId) {
      return null;
    }
    return {
      userId: payload.sub,
      appId: String(payload.appId),
      scopes: Array.isArray(payload.scopes) ? (payload.scopes as string[]) : [],
      valid: true,
    };
  } catch {
    return null;
  }
}

export interface OAuthAccessTokenPayload {
  userId: string;
  appId: string;
  scopes: string[];
  valid: boolean;
}

/**
 * Validate an OAuth access token (issued by issueAccessToken).
 */
export async function verifyAccessToken(
  token: string,
): Promise<OAuthAccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (payload.type !== "oauth_access" || !payload.sub || !payload.appId) {
      return null;
    }
    return {
      userId: payload.sub,
      appId: String(payload.appId),
      scopes: Array.isArray(payload.scopes) ? (payload.scopes as string[]) : [],
      valid: true,
    };
  } catch {
    return null;
  }
}

/**
 * Validate an authorization code (one-time use, expiry-checked).
 */
export async function consumeAuthorizationCode(options: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ userId: string; appId: string; scopes: string[] } | null> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const app = await db.query.oauthApps.findFirst({
    where: eq(schema.oauthApps.clientId, options.clientId),
  });
  if (!app) return null;
  if (app.clientSecretHash !== hashClientSecret(options.clientSecret)) {
    return null;
  }

  const codeHash = createHash("sha256").update(options.code).digest("hex");
  const record = await db.query.oauthAuthorizationCodes.findFirst({
    where: eq(schema.oauthAuthorizationCodes.codeHash, codeHash),
  });
  if (!record) return null;
  if (record.appId !== app.id) return null;
  if (record.usedAt) return null;
  if (new Date(record.expiresAt) < new Date()) return null;
  if (record.redirectUri !== options.redirectUri) return null;

  // One-time use
  await db
    .update(schema.oauthAuthorizationCodes)
    .set({ usedAt: new Date() })
    .where(eq(schema.oauthAuthorizationCodes.id, record.id));

  let scopes: string[] = [];
  try {
    scopes = JSON.parse(record.scopes);
  } catch {
    scopes = [];
  }

  return { userId: record.userId, appId: app.id, scopes };
}

export { generateId, logger };
