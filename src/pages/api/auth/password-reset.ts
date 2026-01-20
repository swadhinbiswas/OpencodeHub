import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { passwordResetTokens, users } from "@/db/schema";
import { parseBody, serverError, success } from "@/lib/api";
import { sendPasswordResetEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { generateId, now } from "@/lib/utils";
import type { APIRoute } from "astro";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { withErrorHandler } from "@/lib/errors";

const requestResetSchema = z.object({
  email: z.string().email(),
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const parsed = await parseBody(request, requestResetSchema);
  if ("error" in parsed) return parsed.error;

  const { email } = parsed.data;
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Find user
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  // If user exists, create token and send email
  if (user) {
    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    // Save token
    await db.insert(passwordResetTokens).values({
      id: generateId(),
      userId: user.id,
      token,
      expiresAt,
      createdAt: new Date(),
    });

    // Send password reset email
    await sendPasswordResetEmail(email, token);
    logger.info({ email }, "Password reset email sent");
  } else {
    logger.info({ email }, "Password reset requested for non-existent email");
  }

  // Always return success to prevent email enumeration
  return success({
    message:
      "If an account exists with that email, we sent a password reset link.",
  });
});
