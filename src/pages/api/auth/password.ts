import { getDatabase } from "@/db";
import { users } from "@/db/schema";
import {
  badRequest,
  parseBody,
  serverError,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { now } from "@/lib/utils";
import type { APIRoute } from "astro";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const PATCH: APIRoute = async ({ request }) => {
  try {
    // Get user from token
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
      return unauthorized();
    }

    // Parse body
    const parsed = await parseBody(request, updatePasswordSchema);
    if ("error" in parsed) return parsed.error;

    const { currentPassword, newPassword } = parsed.data;
    const db = getDatabase();

    // Get user to check password
    const user = await db.query.users.findFirst({
      where: eq(users.id, tokenPayload.userId),
    });

    if (!user) {
      return unauthorized();
    }

    // Verify current password
    if (!user.passwordHash) {
      return badRequest("User has no password set. Please reset your password.");
    }
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return badRequest("Incorrect current password");
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: now(),
      })
      .where(eq(users.id, tokenPayload.userId));

    return success({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Update password error:", error);
    return serverError("Failed to update password");
  }
};
