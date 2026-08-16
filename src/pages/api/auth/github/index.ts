import { github } from "@/lib/oauth";
import { generateState } from "arctic";
import type { APIRoute } from "astro";
import { badRequest } from "@/lib/api";

export const GET: APIRoute = async ({ cookies, redirect }) => {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
        return badRequest("GitHub OAuth is not configured (set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)");
    }

    const state = generateState();
    const url = await github.createAuthorizationURL(state, []);

    cookies.set("github_oauth_state", state, {
        path: "/",
        secure: import.meta.env.PROD,
        httpOnly: true,
        maxAge: 60 * 10,
        sameSite: "lax",
    });

    return redirect(url.toString());
};
