import { getDatabase } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { parseBody, serverError, success } from "@/lib/api";
import { sendPasswordResetEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { generateId, now } from "@/lib/utils";
import type { APIRoute } from "astro";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

const requestResetSchema = z.object({
  email: z.string().email(),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const parsed = await parseBody(request, requestResetSchema);
    if ("error" in parsed) return parsed.error;

    const { email } = parsed.data;
    const db = getDatabase();

    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    // If user exists, create token and send email
    if (user) {
      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour

      // Save token
      await db.insert(passwordResetTokens).values({
        id: generateId(),
        userId: user.id,
        token,
        expiresAt,
        createdAt: now(),
      });

      // Send password reset email
      await sendPasswordResetEmail(email, token);
    }

    // Always return success to prevent email enumeration
    return success({
      message:
        "If an account exists with that email, we sent a password reset link.",
    });
  } catch (error) {
    logger.error({ err: error }, "Password reset request error");
    return serverError("Failed to process request");
  }
};
