import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { github } from "@/lib/oauth";
import { OAuth2RequestError } from "arctic";
import { getSiteUrl } from "@/lib/site-url";

const GITHUB_CLIENT_ID = import.meta.env.OAUTH_GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = import.meta.env.OAUTH_GITHUB_CLIENT_SECRET;
interface GitHubUser {
    id: number;
    login: string;
    email: string;
    name: string;
    avatar_url: string;
    bio: string;
    company: string;
    location: string;
    blog: string;
}

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
    const SITE_URL = getSiteUrl();
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = cookies.get("github_oauth_state")?.value;

    // Clear state cookie
    cookies.delete("github_oauth_state", { path: "/" });

    if (!code || !state || !storedState || state !== storedState) {
        return redirect("/login?error=oauth_failed");
    }

    try {
        const tokens = await github.validateAuthorizationCode(code);
        const accessToken = tokens.accessToken();


        // Get user info from GitHub
        const userResponse = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
        });

        const githubUser: GitHubUser = await userResponse.json();

        // Get user emails if email is not public
        let email = githubUser.email;
        if (!email) {
            const emailsResponse = await fetch("https://api.github.com/user/emails", {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/json",
                },
            });
            const emails = await emailsResponse.json();
            const primaryEmail = emails.find((e: any) => e.primary);
            email = primaryEmail?.email || emails[0]?.email;
        }

        if (!email) {
            return redirect("/login?error=no_email");
        }

        const db = getDatabase() as NodePgDatabase<typeof schema>;

        // Check if OAuth account already exists
        const existingOAuth = await db.query.oauthAccounts.findFirst({
            where: and(
                eq(schema.oauthAccounts.provider, "github"),
                eq(schema.oauthAccounts.providerAccountId, String(githubUser.id))
            ),
            with: {
                user: true,
            },
        });

        let userId: string;

        if (existingOAuth) {
            // User already linked - update tokens
            await db
                .update(schema.oauthAccounts)
                .set({
                    accessToken,
                })
                .where(eq(schema.oauthAccounts.id, existingOAuth.id));

            // Update user avatar
            await db
                .update(schema.users)
                .set({
                    avatarUrl: githubUser.avatar_url,
                    updatedAt: new Date(),
                })
                .where(eq(schema.users.id, existingOAuth.userId));

            userId = existingOAuth.userId;
        } else {
            // Check if user with email exists
            let user = await db.query.users.findFirst({
                where: eq(schema.users.email, email),
            });

            if (user) {
                // Link GitHub to existing user
                await db.insert(schema.oauthAccounts).values({
                    id: crypto.randomUUID(),
                    userId: user.id,
                    provider: "github",
                    providerAccountId: String(githubUser.id),
                    accessToken,
                    createdAt: new Date(),
                });

                // Update user avatar
                await db
                    .update(schema.users)
                    .set({
                        avatarUrl: githubUser.avatar_url,
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.users.id, user.id));

                userId = user.id;
            } else {
                // Create new user
                let username = githubUser.login;
                const existingUsername = await db.query.users.findFirst({
                    where: eq(schema.users.username, username),
                });
                if (existingUsername) {
                    username = `${githubUser.login}-${crypto.randomUUID().slice(0, 8)}`;
                }

                const newUserId = crypto.randomUUID();

                await db.insert(schema.users).values({
                    id: newUserId,
                    username,
                    email,
                    displayName: githubUser.name || githubUser.login,
                    bio: githubUser.bio,
                    company: githubUser.company,
                    location: githubUser.location,
                    website: githubUser.blog,
                    avatarUrl: githubUser.avatar_url,
                    emailVerified: true, // GitHub verified the email
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

                // Create OAuth link
                await db.insert(schema.oauthAccounts).values({
                    id: crypto.randomUUID(),
                    userId: newUserId,
                    provider: "github",
                    providerAccountId: String(githubUser.id),
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

        logger.info({ userId }, "GitHub OAuth login successful");

        return redirect("/");
    } catch (error) {
        if (error instanceof OAuth2RequestError) {
            return new Response(null, {
                status: 400
            });
        }
        logger.error({ error }, "GitHub OAuth error");
        return redirect("/login?error=oauth_failed");
    }
};
