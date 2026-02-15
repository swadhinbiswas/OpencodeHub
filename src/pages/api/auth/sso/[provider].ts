/**
 * SSO Login Initiation
 * Redirects user to OIDC provider for authentication
 */

import type { APIRoute } from "astro";
import { getOIDCConfig, getAuthorizationUrl } from "@/lib/oidc";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils";
import { getSiteUrl } from "@/lib/site-url";

export const GET: APIRoute = async ({ params, cookies, redirect }) => {
    const SITE_URL = getSiteUrl();
    const provider = params.provider;

    if (!provider) {
        return redirect("/login?error=no_provider");
    }

    try {
        const config = await getOIDCConfig(provider);

        if (!config || !config.enabled) {
            logger.warn({ provider }, "SSO provider not found or disabled");
            return redirect("/login?error=provider_not_found");
        }

        // Generate state and nonce for CSRF protection
        const state = generateId();
        const nonce = generateId();

        // Store in cookies for validation on callback
        cookies.set("oidc_state", state, {
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: "lax",
            path: "/",
            maxAge: 600, // 10 minutes
        });

        cookies.set("oidc_nonce", nonce, {
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: "lax",
            path: "/",
            maxAge: 600,
        });

        cookies.set("oidc_provider", provider, {
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: "lax",
            path: "/",
            maxAge: 600,
        });

        const redirectUri = `${SITE_URL}/api/auth/sso/callback`;
        const authUrl = await getAuthorizationUrl(config, redirectUri, state, nonce);

        logger.info({ provider }, "SSO login initiated");
        return redirect(authUrl);
    } catch (error) {
        logger.error({ error, provider }, "SSO login initiation failed");
        return redirect("/login?error=sso_failed");
    }
};
