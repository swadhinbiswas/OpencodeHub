import { github } from "@/lib/oauth";
import { OAuth2RequestError } from "arctic";
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { createSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

interface GitHubUser {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string;
    email: string | null;
}

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = cookies.get("github_oauth_state")?.value;

    cookies.delete("github_oauth_state", { path: "/" });

    if (!code || !state || !storedState || state !== storedState) {
        return redirect("/login?error=oauth_failed");
    }

    try {
        const tokens = await github.validateAuthorizationCode(code);
        const accessToken = tokens.accessToken();

        const response = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "User-Agent": "OpenCodeHub",
                Accept: "application/vnd.github+json",
            },
        });
        if (!response.ok) {
            logger.warn({ status: response.status }, "GitHub userinfo failed");
            return redirect("/login?error=oauth_failed");
        }
        const ghUser: GitHubUser = await response.json();

        const db = getDatabase() as NodePgDatabase<typeof schema>;

        // Check if OAuth account exists
        const existingOAuth = await db.query.oauthAccounts.findFirst({
            where: and(
                eq(schema.oauthAccounts.provider, "github"),
                eq(schema.oauthAccounts.providerAccountId, String(ghUser.id))
            ),
            with: { user: true },
        });

        let userId: string;

        if (existingOAuth) {
            await db
                .update(schema.oauthAccounts)
                .set({ accessToken })
                .where(eq(schema.oauthAccounts.id, existingOAuth.id));
            userId = existingOAuth.userId;
        } else {
            // Try to link by email
            let user = null;
            if (ghUser.email) {
                user = await db.query.users.findFirst({
                    where: eq(schema.users.email, ghUser.email),
                });
            }

            if (user) {
                await db.insert(schema.oauthAccounts).values({
                    id: crypto.randomUUID(),
                    userId: user.id,
                    provider: "github",
                    providerAccountId: String(ghUser.id),
                    accessToken,
                    createdAt: new Date(),
                });
                userId = user.id;
            } else {
                // Create user
                let username = ghUser.login || (ghUser.email || "gh").split("@")[0];
                let existingUsername = await db.query.users.findFirst({
                    where: eq(schema.users.username, username),
                });
                let suffix = 1;
                while (existingUsername) {
                    username = `${ghUser.login || "gh"}${suffix}`;
                    existingUsername = await db.query.users.findFirst({
                        where: eq(schema.users.username, username),
                    });
                    suffix++;
                }

                const newUserId = crypto.randomUUID();
                await db.insert(schema.users).values({
                    id: newUserId,
                    username,
                    // email is NOT NULL in the schema; GitHub may not expose it
                    // without extra scopes — derive a stable placeholder
                    email: ghUser.email || `${username}@users.noreply.opencodehub.local`,
                    displayName: ghUser.name || ghUser.login,
                    avatarUrl: ghUser.avatar_url,
                    passwordHash: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                await db.insert(schema.oauthAccounts).values({
                    id: crypto.randomUUID(),
                    userId: newUserId,
                    provider: "github",
                    providerAccountId: String(ghUser.id),
                    accessToken,
                    createdAt: new Date(),
                });
                userId = newUserId;
            }
        }

        // Create session
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
            logger.warn({ error }, "GitHub OAuth request error");
            return redirect("/login?error=oauth_failed");
        }
        logger.error({ error }, "GitHub OAuth callback error");
        return redirect("/login?error=oauth_failed");
    }
};
