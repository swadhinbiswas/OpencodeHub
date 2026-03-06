/**
 * Auth API - Login
 */
import { getDatabase, schema } from "@/db";
import { sessions, users } from "@/db/schema";
import { parseBody, success, unauthorized } from "@/lib/api";
import {
  createSession,
  createToken,
  verify2FAToken,
  verifyPassword,
} from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/middleware/rate-limit";
import { type APIRoute } from "astro";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

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
    return unauthorized("Invalid credentials");
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    logger.warn({ user: user.username }, "Invalid password attempt");
    return unauthorized("Invalid credentials");
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
