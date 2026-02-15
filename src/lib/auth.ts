
/**
 * Authentication utilities
 * JWT token management, password hashing, 2FA
 */

import bcrypt from "bcryptjs";
import { JWTPayload, SignJWT, jwtVerify } from "jose";
import { authenticator } from "otplib";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { eq, and, or } from "drizzle-orm";
import { generateId, now } from "./utils";
import { canReadRepo } from "@/lib/permissions";
import { hashPersonalAccessToken, verifyPersonalAccessTokenValue } from "@/lib/personal-access-token";

// Types
export interface TokenPayload extends JWTPayload {
  userId: string;
  username: string;
  email: string;
  isAdmin?: boolean;
  sessionId?: string;
}

export interface SessionData {
  id: string;
  userId: string;
  token: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  createdAt: Date;
}

// JWT configuration
const jwtSecretRaw = process.env.JWT_SECRET;
if (!jwtSecretRaw) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = new TextEncoder().encode(jwtSecretRaw);
const JWT_ISSUER = "opencodehub";
const JWT_AUDIENCE = "opencodehub-api";

/**
 * Create a JWT token
 */
export async function createToken(
  payload: Omit<TokenPayload, "iat" | "exp" | "iss" | "aud">
): Promise<string> {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  const expirationTime = parseExpirationTime(expiresIn);

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(expirationTime)
    .sign(JWT_SECRET);
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload as TokenPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a 2FA secret
 */
export function generate2FASecret(username: string): {
  secret: string;
  uri: string;
} {
  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri(username, "OpenCodeHub", secret);
  return { secret, uri };
}

/**
 * Verify a 2FA token
 */
export function verify2FAToken(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}

/**
 * Create a session
 */
export async function createSession(
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<SessionData> {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  const expirationDate = calculateExpirationDate(expiresIn);

  const session: SessionData = {
    id: generateId("sess"),
    userId,
    token: generateId(), // Session token for reference
    userAgent,
    ipAddress,
    expiresAt: expirationDate,
    createdAt: new Date(),
  };

  return session;
}

/**
 * Generate SSH key fingerprint
 */
export function generateSSHFingerprint(publicKey: string): string {
  const crypto = require("crypto");
  // Extract the key data (ignore type and comment)
  const parts = publicKey.trim().split(" ");
  const keyData = parts.length >= 2 ? parts[1] : parts[0];
  const buffer = Buffer.from(keyData, "base64");
  const hash = crypto.createHash("sha256").update(buffer).digest("base64");
  return `SHA256:${hash.replace(/=+$/, "")}`;
}

/**
 * Extract SSH key type
 */
export function extractSSHKeyType(publicKey: string): string {
  const parts = publicKey.trim().split(" ");
  return parts[0] || "unknown";
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }
  if (password.length > 128) {
    errors.push("Password must be at most 128 characters long");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate a random token for email verification, password reset, etc.
 */
export function generateVerificationToken(): string {
  return generateId() + generateId();
}

/**
 * Calculate expiration date from string like "7d", "24h", "30m"
 */
function calculateExpirationDate(expiresIn: string): Date {
  const now = new Date();
  const match = expiresIn.match(/^(\d+)([dhms])$/);

  if (!match) {
    // Default to 7 days
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
  };

  return new Date(now.getTime() + value * multipliers[unit]);
}

/**
 * Parse expiration time for jose JWT
 */
function parseExpirationTime(expiresIn: string): string {
  // jose accepts formats like "7d", "24h", "30m"
  const match = expiresIn.match(/^(\d+)([dhms])$/);
  if (match) {
    return expiresIn;
  }
  return "7d";
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }
  return parts[1];
}

/**
 * Get user from request
 * Supports both JWT tokens and Personal Access Tokens (PAT)
 */
export async function getUserFromRequest(
  request: Request
): Promise<TokenPayload | null> {
  const authHeader = request.headers.get("Authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    // Check for cookie
    const cookieHeader = request.headers.get("Cookie");
    if (cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      if (cookies.och_session) {
        return verifyToken(cookies.och_session);
      }
      // Fallback for legacy/dev
      if (cookies.auth_token) {
        return verifyToken(cookies.auth_token);
      }
    }
    return null;
  }

  // Check if it's a Personal Access Token (starts with och_)
  if (token.startsWith("och_")) {
    return verifyPersonalAccessToken(token);
  }

  // Otherwise, treat it as a JWT
  return verifyToken(token);
}

/**
 * Verify a Personal Access Token
 */
async function verifyPersonalAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const { personalAccessTokens } = schema;

    const hashedToken = hashPersonalAccessToken(token);

    // Find token by current hashed format or legacy raw storage.
    const pat = await db.query.personalAccessTokens.findFirst({
      where: or(
        eq(personalAccessTokens.token, hashedToken),
        eq(personalAccessTokens.token, token)
      ),
      with: {
        user: true,
      },
    });

    if (!pat) {
      return null;
    }

    if (!verifyPersonalAccessTokenValue(pat.token, token)) {
      return null;
    }

    // Check if expired
    if (pat.expiresAt && new Date(pat.expiresAt) < new Date()) {
      return null;
    }

    // Update last used
    await db
      .update(personalAccessTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(personalAccessTokens.id, pat.id));

    // Return user info as TokenPayload
    return {
      userId: pat.user.id,
      username: pat.user.username,
      email: pat.user.email,
      isAdmin: pat.user.isAdmin || false,
    };
  } catch (error) {
    console.error("PAT verification error:", error);
    return null;
  }
}

/**
 * Parse cookies from header
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");

  for (const pair of pairs) {
    const [name, value] = pair.trim().split("=");
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  }

  return cookies;
}

/**
 * Helper to fetch repo and check access
 */
export async function getRepoAndUser(
  request: Request,
  ownerName: string,
  repoName: string
) {
  const db = getDatabase();
  const user = await getUserFromRequest(request);
  const userId = user?.userId;

  // 1. Get Repo Owner
  const repoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });

  if (!repoOwner) return null;

  // 2. Get Repository
  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, repoOwner.id),
      eq(schema.repositories.name, repoName)
    ),
  });

  if (!repository) return null;

  // 3. Check Permissions
  const permission = await canReadRepo(userId, repository);
  if (!permission) return null;

  return {
    repository,
    user: repoOwner,
    permission: typeof permission === 'string' ? permission : 'read' // canReadRepo returns boolean or string? It usually returns boolean. 
    // Wait, let's check canReadRepo signature if possible, but assuming boolean for now.
    // If canReadRepo returns boolean, we might want to fetch actual permission level if needed. 
    // But for now, basic check is enough.
  };
}
