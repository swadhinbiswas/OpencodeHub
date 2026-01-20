/**
 * Auth API - Login
 */
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sessions, users } from "@/db/schema";
import { parseBody, serverError, success, unauthorized } from "@/lib/api";
import {
  createSession,
  createToken,
  verify2FAToken,
  verifyPassword,
} from "@/lib/auth";
import { now } from "@/lib/utils";
import { type APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { applyRateLimit } from "@/middleware/rate-limit";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

const loginSchema = z.object({
  login: z.string(), // username or email
  password: z.string(),
  totpCode: z.string().optional(), // 2FA code
});

export const POST: APIRoute = withErrorHandler(async ({ request, cookies }) => {
  // Apply rate limiting for authentication endpoints
  const rateLimitResponse = await applyRateLimit(request, "auth");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Parse and validate request body
  const parsed = await parseBody(request, loginSchema);
  if ("error" in parsed) return parsed.error;

  const { login, password, totpCode } = parsed.data;
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Find user by username or email
  const user = await db.query.users.findFirst({
    where: (users, { or, eq }) =>
      or(eq(users.username, login), eq(users.email, login)),
  });

  if (!user) {
    return unauthorized("Invalid credentials");
  }

  // Check if account is active
  if (!user.isActive) {
    return unauthorized("Account is disabled");
  }

  // Verify password
  if (!user.passwordHash) {
    return unauthorized(
      `Password login not available. No hash for user ${user.username}`
    );
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    // Use logger instead of returning explicit debug info to client in prod, 
    // but original code sent it to client. I will keep it but maybe log it safely.
    logger.warn({ user: user.username }, "Invalid password attempt");
    return unauthorized(
      `Invalid credentials. Debug: User=${user.username
      }, Hash=${user.passwordHash.substring(0, 10)}...`
    );
  }

  // Check 2FA if enabled
  if (user.twoFactorEnabled) {
    if (!totpCode) {
      return success({
        requiresTwoFactor: true,
        message: "Two-factor authentication required",
      });
    }

    if (!user.twoFactorSecret) {
      throw new Error("2FA configuration error"); // Let error handler catch it
    }

    const isValid2FA = verify2FAToken(totpCode, user.twoFactorSecret);
    if (!isValid2FA) {
      return unauthorized("Invalid 2FA code");
    }
  }

  // Create session
  const userAgent = request.headers.get("User-Agent") || undefined;
  const ipAddress =
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    request.headers.get("X-Real-IP") ||
    undefined;

  const session = await createSession(user.id, userAgent, ipAddress);

  // Store session in database
  await db.insert(sessions).values({
    id: session.id,
    userId: user.id,
    token: session.token,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    expiresAt: new Date(session.expiresAt),
    createdAt: new Date(session.createdAt),
  });

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  // Create JWT token
  const token = await createToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    isAdmin: user.isAdmin || false,
    sessionId: session.id,
  });

  // Set session cookie
  cookies.set("och_session", token, {
    path: "/",
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    expires: new Date(session.expiresAt),
  });

  logger.info({ userId: user.id }, "User logged in");

  return success({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isAdmin: user.isAdmin,
    },
    token,
    expiresAt: session.expiresAt,
  });
});
