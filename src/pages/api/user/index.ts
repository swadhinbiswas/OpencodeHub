/**
 * User API - Get current user info
 * Used by CLI to verify authentication
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { users } from "@/db/schema/users";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, success, serverError } from "@/lib/api";

// GET /api/user - Get current authenticated user
export const GET: APIRoute = async ({ request }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const db = getDatabase();

        const user = await db.query.users.findFirst({
            where: eq(users.id, tokenPayload.userId),
        });

        if (!user) {
            return unauthorized("User not found");
        }

        return success({
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            bio: user.bio,
            location: user.location,
            website: user.website,
            company: user.company,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
        });
    } catch (error) {
        console.error("Get user error:", error);
        return serverError("Failed to get user info");
    }
};
