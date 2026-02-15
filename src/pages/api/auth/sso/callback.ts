/**
 * SSO Callback
 * Handles OIDC provider callback after authentication
 */

import type { APIRoute } from "astro";
import { getOIDCConfig, handleOIDCCallback } from "@/lib/oidc";
import { createSession, createToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getSiteUrl } from "@/lib/site-url";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
    const SITE_URL = getSiteUrl();
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const storedState = cookies.get("oidc_state")?.value;
    const storedNonce = cookies.get("oidc_nonce")?.value;
    const provider = cookies.get("oidc_provider")?.value;

    // Clear cookies
    cookies.delete("oidc_state", { path: "/" });
    cookies.delete("oidc_nonce", { path: "/" });
    cookies.delete("oidc_provider", { path: "/" });

    // Check for OAuth errors
    if (error) {
        logger.error({ error, provider }, "OIDC provider returned error");
        return redirect(`/login?error=${error}`);
    }

    // Validate state
    if (!code || !state || state !== storedState) {
        logger.warn({ provider }, "OIDC state mismatch or missing code");
        return redirect("/login?error=invalid_state");
    }

    if (!provider) {
        return redirect("/login?error=no_provider");
    }

    try {
        const config = await getOIDCConfig(provider);

        if (!config || !config.enabled) {
            return redirect("/login?error=provider_not_found");
        }

        const redirectUri = `${SITE_URL}/api/auth/sso/callback`;
        const { userId, isNewUser } = await handleOIDCCallback(config, code, redirectUri);

        // Create session
        const session = await createSession(userId);

        // Create JWT
        const token = await createToken({
            userId,
            username: "", // Will be fetched from DB if needed
            email: "",
            isAdmin: false,
            sessionId: session.id,
        });

        // Set session cookie
        cookies.set("och_session", token, {
            path: "/",
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        logger.info({ userId, provider, isNewUser }, "SSO login successful");

        // Redirect to welcome page for new users, dashboard for existing
        return redirect(isNewUser ? "/welcome" : "/");
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error({ error: errorMessage, provider }, "SSO callback failed");

        // Provide more specific error messages
        if (errorMessage.includes("domain not allowed")) {
            return redirect("/login?error=domain_not_allowed");
        }
        if (errorMessage.includes("auto-creation is disabled")) {
            return redirect("/login?error=user_not_found");
        }

        return redirect("/login?error=sso_failed");
    }
};
