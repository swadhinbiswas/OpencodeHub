
import { google } from "@/lib/oauth";
import { OAuth2RequestError } from "arctic";
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { createSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

interface GoogleUser {
    sub: string;
    name: string;
    picture: string;
    email: string;
    email_verified: boolean;
}

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = cookies.get("google_oauth_state")?.value;
    const codeVerifier = cookies.get("google_oauth_verifier")?.value;

    // Clear state cookies
    cookies.delete("google_oauth_state", { path: "/" });
    cookies.delete("google_oauth_verifier", { path: "/" });

    if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
        return redirect("/login?error=oauth_failed");
    }

    try {
        const tokens = await google.validateAuthorizationCode(code, codeVerifier);
        const accessToken = tokens.accessToken();

        const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        const googleUser: GoogleUser = await response.json();

        const db = getDatabase() as NodePgDatabase<typeof schema>;

        // Check if OAuth account exists
        const existingOAuth = await db.query.oauthAccounts.findFirst({
            where: and(
                eq(schema.oauthAccounts.provider, "google"),
                eq(schema.oauthAccounts.providerAccountId, googleUser.sub)
            ),
            with: {
                user: true,
            },
        });

        let userId: string;

        if (existingOAuth) {
            await db
                .update(schema.oauthAccounts)
                .set({
                    accessToken,
                })
                .where(eq(schema.oauthAccounts.id, existingOAuth.id));

            userId = existingOAuth.userId;
        } else {
            // Check email
            const user = await db.query.users.findFirst({
                where: eq(schema.users.email, googleUser.email),
            });

            if (user) {
                // Link
                await db.insert(schema.oauthAccounts).values({
                    id: crypto.randomUUID(),
                    userId: user.id,
                    provider: "google",
                    providerAccountId: googleUser.sub,
                    accessToken,
                    createdAt: new Date(),
                });
                userId = user.id;
            } else {
                // Create user
                // Google doesn't give a "username", so we make one from email or name
                let baseUsername = googleUser.email.split("@")[0];
                let username = baseUsername;
                const existingUsername = await db.query.users.findFirst({
                    where: eq(schema.users.username, username),
                });
                if (existingUsername) {
                    username = `${baseUsername}-${crypto.randomUUID().slice(0, 8)}`;
                }

                const newUserId = crypto.randomUUID();

                await db.insert(schema.users).values({
                    id: newUserId,
                    username,
                    email: googleUser.email,
                    displayName: googleUser.name,
                    avatarUrl: googleUser.picture,
                    emailVerified: googleUser.email_verified,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

                await db.insert(schema.oauthAccounts).values({
                    id: crypto.randomUUID(),
                    userId: newUserId,
                    provider: "google",
                    providerAccountId: googleUser.sub,
                    accessToken,
                    createdAt: new Date(),
                });

                userId = newUserId;
            }
        }

        const session = await createSession(userId);
        cookies.set("och_session", session.token, {
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        return redirect("/");
    } catch (error) {
        if (error instanceof OAuth2RequestError) {
            return new Response(null, {
                status: 400
            });
        }
        logger.error({ error }, "Google OAuth error");
        return redirect("/login?error=oauth_failed");
    }
};
