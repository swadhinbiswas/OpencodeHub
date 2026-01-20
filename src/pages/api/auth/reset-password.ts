import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { passwordResetTokens, users } from "@/db/schema";
import { badRequest, parseBody, serverError, success } from "@/lib/api";
import { now } from "@/lib/utils";
import type { APIRoute } from "astro";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const parsed = await parseBody(request, resetPasswordSchema);
  if ("error" in parsed) return parsed.error;

  const { token, password } = parsed.data;
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Find token
  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.token, token),
  });

  if (!resetToken) {
    logger.warn({ token }, "Invalid password reset token used");
    return badRequest("Invalid or expired token");
  }

  // Check expiration
  if (new Date(resetToken.expiresAt) < new Date()) {
    // Delete expired token
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.id, resetToken.id));
    logger.warn({ token }, "Expired password reset token used");
    return badRequest("Invalid or expired token");
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // Update user password
  await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, resetToken.userId));

  // Delete used token
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.id, resetToken.id));

  logger.info({ userId: resetToken.userId }, "Password reset completed via token");

  return success({ message: "Password reset successfully" });
});
