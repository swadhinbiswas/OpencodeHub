import type { APIRoute } from "astro";

const GITHUB_CLIENT_ID = import.meta.env.OAUTH_GITHUB_CLIENT_ID;
// removed unused GITHUB_CLIENT_SECRET
const SITE_URL = import.meta.env.SITE_URL || "http://localhost:4321";

export const GET: APIRoute = async ({ redirect, cookies }) => {
    if (!GITHUB_CLIENT_ID) {
        return new Response("GitHub OAuth not configured", { status: 500 });
    }

    // Generate state for CSRF protection
    const state = crypto.randomUUID();
    cookies.set("oauth_state", state, {
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: "lax",
        path: "/",
        maxAge: 600, // 10 minutes
    });

    const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        redirect_uri: `${SITE_URL}/api/auth/github/callback`,
        scope: "read:user user:email",
        state,
    });

    return redirect(`https://github.com/login/oauth/authorize?${params}`);
};
