/**
 * Auth API - Get current user
 */
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { users } from "@/db/schema";
import {
  notFound,
  parseBody,
  serverError,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { now } from "@/lib/utils";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

const updateProfileSchema = z.object({
  displayName: z.string().max(100).optional(),
  bio: z.string().max(255).optional(),
  location: z.string().max(100).optional(),
  website: z.string().url().max(255).optional().or(z.literal("")),
  company: z.string().max(100).optional(),
  avatarUrl: z.string().url().max(500).optional().or(z.literal("")),
});

export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  // Get user from token
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Get full user data
  const user = await db.query.users.findFirst({
    where: eq(users.id, tokenPayload.userId),
  });

  if (!user) {
    return notFound("User not found");
  }

  return success({
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    location: user.location,
    website: user.website,
    company: user.company,
    isAdmin: user.isAdmin,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
  });
});

export const PATCH: APIRoute = withErrorHandler(async ({ request }) => {
  // Get user from token
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  // Parse body
  const parsed = await parseBody(request, updateProfileSchema);
  if ("error" in parsed) return parsed.error;

  const { displayName, bio, location, website, company, avatarUrl } = parsed.data;
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Update user
  await db
    .update(users)
    .set({
      displayName,
      bio,
      location,
      website,
      company,
      avatarUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, tokenPayload.userId));

  logger.info({ userId: tokenPayload.userId }, "User profile updated");

  return success({ message: "Profile updated successfully" });
});

export const DELETE: APIRoute = withErrorHandler(async ({ request, cookies }) => {
  // Get user from token
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Delete user
  await db.delete(users).where(eq(users.id, tokenPayload.userId));

  // Clear cookie
  cookies.delete("token", { path: "/" }); // check token name, login sets "och_session"

  logger.info({ userId: tokenPayload.userId }, "User account deleted");

  return success({ message: "Account deleted successfully" });
});
