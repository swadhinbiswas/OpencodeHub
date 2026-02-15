
import { github } from "@/lib/oauth";
import { generateState } from "arctic";
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ cookies, redirect }) => {
    const state = generateState();
    const url = await github.createAuthorizationURL(state, ["user:email", "read:user"]);

    cookies.set("github_oauth_state", state, {
        path: "/",
        secure: import.meta.env.PROD,
        httpOnly: true,
        maxAge: 60 * 10,
        sameSite: "lax",
    });

    return redirect(url.toString());
};
