/**
 * Auth API - Register new user
 */
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sessions, users } from "@/db/schema";
import {
  badRequest,
  conflict,
  created,
  parseBody,
  serverError,
} from "@/lib/api";
import { createSession, createToken, hashPassword } from "@/lib/auth";
import { generateId, isValidEmail, isValidUsername, now } from "@/lib/utils";
import { type APIRoute } from "astro";
import { applyRateLimit } from "@/middleware/rate-limit";
import { RegisterUserSchema } from "@/lib/validation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

const registerSchema = z.object({
  username: z.string().min(2).max(39),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().optional(),
});

export const POST: APIRoute = withErrorHandler(async ({ request, cookies }) => {
  try {
    // ... existing logic ...
    // (Note: Since I can't easily wrap the whole thing blindly, I'll just check specific confusing parts or wrap the whole body)

    // Re-implementing the body to wrap in try-catch for debugging
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(request, "auth");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Check if registration is enabled
    if (process.env.ENABLE_REGISTRATION === "false") {
      return badRequest("Registration is currently disabled");
    }

    // Parse and validate request body
    const parsed = await parseBody(request, registerSchema);
    if ("error" in parsed) return parsed.error;

    const { username, email, password, displayName } = parsed.data;

    // Additional validation with Zod schema (stricter)
    const validation = RegisterUserSchema.safeParse({ username, email, password, displayName });
    if (!validation.success) {
      const errorMessages = validation.error.errors.map(e => e.message).join(', ');
      return badRequest(`Validation failed: ${errorMessages}`);
    }

    // Validate username format
    if (!isValidUsername(username)) {
      return badRequest(
        "Invalid username format. Use only letters, numbers, and hyphens."
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return badRequest("Invalid email format");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Check if username or email already exists
    const existingUser = await db.query.users.findFirst({
      where: (users, { or, eq }) =>
        or(eq(users.username, username), eq(users.email, email)),
    });

    if (existingUser) {
      if (existingUser.username === username) {
        return conflict("Username already taken");
      }
      return conflict("Email already registered");
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const userId = generateId("usr");
    const timestamp = new Date();

    await db.insert(users).values({
      id: userId,
      username,
      email,
      passwordHash,
      displayName: displayName || username,
      isActive: true,
      emailVerified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Create session
    const userAgent = request.headers.get("User-Agent") || undefined;
    const session = await createSession(userId, userAgent);

    // Store session in database
    await db.insert(sessions).values({
      id: session.id,
      userId: session.userId,
      token: session.token,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      expiresAt: new Date(session.expiresAt),
      createdAt: new Date(session.createdAt),
    });

    // Create JWT token
    const token = await createToken({
      userId,
      username,
      email,
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

    logger.info({ userId, username }, "User registered and logged in");

    return created({
      user: {
        id: userId,
        username,
        email,
        displayName: displayName || username,
      },
      token,
      expiresAt: session.expiresAt,
    });
  } catch (err: any) {
    if (err.code === "23505") {
      return conflict("Username or email already exists");
    }
    logger.error({ err }, "Registration failed");
    return serverError("Registration failed");
  }
});
