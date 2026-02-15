
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logActivity } from "@/lib/activity";

export const POST: APIRoute = async ({ params, request, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { username } = params;
    if (!username) {
        return new Response(JSON.stringify({ error: "Username is required" }), { status: 400 });
    }

    try {
        const db = getDatabase() as NodePgDatabase<typeof schema>;

        // Find target user
        const targetUser = await db.query.users.findFirst({
            where: eq(schema.users.username, username),
        });

        if (!targetUser) {
            return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
        }

        if (targetUser.id === user.id) {
            return new Response(JSON.stringify({ error: "Cannot follow yourself" }), { status: 400 });
        }

        const { action } = await request.json(); // 'follow' or 'unfollow'

        if (action === "follow") {
            // Check if already following
            const existing = await db.query.userFollowers.findFirst({
                where: and(
                    eq(schema.userFollowers.followerId, user.id),
                    eq(schema.userFollowers.followeeId, targetUser.id)
                ),
            });

            if (!existing) {
                await db.insert(schema.userFollowers).values({
                    followerId: user.id,
                    followeeId: targetUser.id,
                    createdAt: new Date(),
                });

                // Log activity
                await logActivity(
                    user.id,
                    "follow",
                    "followed",
                    "user",
                    targetUser.id,
                    undefined,
                    { targetUsername: targetUser.username }
                );
            }
        } else if (action === "unfollow") {
            await db.delete(schema.userFollowers)
                .where(and(
                    eq(schema.userFollowers.followerId, user.id),
                    eq(schema.userFollowers.followeeId, targetUser.id)
                ));
        } else {
            return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error("Failed to follow/unfollow user:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
};
