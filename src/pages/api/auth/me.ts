/**
 * Auth API - Get current user
 */
import { getDatabase } from "@/db";
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

const updateProfileSchema = z.object({
  displayName: z.string().max(100).optional(),
  bio: z.string().max(255).optional(),
  location: z.string().max(100).optional(),
  website: z.string().url().max(255).optional().or(z.literal("")),
  company: z.string().max(100).optional(),
  avatarUrl: z.string().url().max(500).optional().or(z.literal("")),
});

export const GET: APIRoute = async ({ request }) => {
  try {
    // Get user from token
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
      return unauthorized();
    }

    const db = getDatabase();

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
  } catch (error) {
    console.error("Get user error:", error);
    return serverError("Failed to get user data");
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    // Get user from token
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
      return unauthorized();
    }

    // Parse body
    const parsed = await parseBody(request, updateProfileSchema);
    if ("error" in parsed) return parsed.error;

    const { displayName, bio, location, website, company, avatarUrl } = parsed.data;
    const db = getDatabase();

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
        updatedAt: now(),
      })
      .where(eq(users.id, tokenPayload.userId));

    return success({ message: "Profile updated successfully" });
  } catch (error) {
    console.error("Update profile error:", error);
    return serverError("Failed to update profile");
  }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  try {
    // Get user from token
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
      return unauthorized();
    }

    const db = getDatabase();

    // Delete user
    await db.delete(users).where(eq(users.id, tokenPayload.userId));

    // Clear cookie
    cookies.delete("token", { path: "/" });

    return success({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete account error:", error);
    return serverError("Failed to delete account");
  }
};
