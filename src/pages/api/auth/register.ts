/**
 * Auth API - Register new user
 */
import { getDatabase } from "@/db";
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

const registerSchema = z.object({
  username: z.string().min(2).max(39),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().optional(),
});

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
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

    const db = getDatabase();

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
    const timestamp = now();

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
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
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
  } catch (error) {
    console.error("Registration error:", error);
    return serverError("Failed to create user");
  }
};
