/**
 * OIDC (OpenID Connect) SSO Provider
 * Supports any OIDC-compliant identity provider:
 * - Google Workspace
 * - Okta
 * - Auth0
 * - Azure AD
 * - Keycloak
 * - Any custom OIDC provider
 */

import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { generateId } from "./utils";

// Types
export interface OIDCConfig {
    id: string;
    name: string;                  // Display name (e.g., "Company SSO")
    issuer: string;                // OIDC issuer URL
    clientId: string;
    clientSecret: string;
    scopes: string[];              // Usually ["openid", "profile", "email"]
    authorizationUrl?: string;     // Override for non-standard providers
    tokenUrl?: string;
    userInfoUrl?: string;
    jwksUri?: string;
    enabled: boolean;
    autoCreateUsers: boolean;      // Create users on first login
    allowedDomains?: string[];     // Restrict to specific email domains
    defaultRole?: string;          // Default role for new users
    organizationId?: string;       // If scoped to an organization
}

export interface OIDCTokens {
    accessToken: string;
    refreshToken?: string;
    idToken: string;
    expiresIn: number;
    tokenType: string;
}

export interface OIDCUserInfo {
    sub: string;                   // Unique identifier
    email: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    preferred_username?: string;
    groups?: string[];             // For role mapping
}

interface OIDCDiscovery {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    scopes_supported: string[];
}

// Cache discovery documents
const discoveryCache = new Map<string, { doc: OIDCDiscovery; expiresAt: number }>();

/**
 * Fetch OIDC discovery document
 */
export async function discoverOIDC(issuer: string): Promise<OIDCDiscovery> {
    const cached = discoveryCache.get(issuer);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.doc;
    }

    const wellKnownUrl = new URL("/.well-known/openid-configuration", issuer);

    const response = await fetch(wellKnownUrl.toString());
    if (!response.ok) {
        throw new Error(`Failed to fetch OIDC discovery document: ${response.status}`);
    }

    const doc = await response.json() as OIDCDiscovery;

    // Cache for 1 hour
    discoveryCache.set(issuer, {
        doc,
        expiresAt: Date.now() + 3600000,
    });

    return doc;
}

/**
 * Generate authorization URL for OIDC login
 */
export async function getAuthorizationUrl(
    config: OIDCConfig,
    redirectUri: string,
    state: string,
    nonce: string
): Promise<string> {
    const discovery = await discoverOIDC(config.issuer);
    const authUrl = config.authorizationUrl || discovery.authorization_endpoint;

    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes.join(" "),
        state,
        nonce,
    });

    return `${authUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
    config: OIDCConfig,
    code: string,
    redirectUri: string
): Promise<OIDCTokens> {
    const discovery = await discoverOIDC(config.issuer);
    const tokenUrl = config.tokenUrl || discovery.token_endpoint;

    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            redirect_uri: redirectUri,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        logger.error({ error, status: response.status }, "OIDC token exchange failed");
        throw new Error(`OIDC token exchange failed: ${response.status}`);
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
        expiresIn: data.expires_in,
        tokenType: data.token_type,
    };
}

/**
 * Get user info from OIDC provider
 */
export async function getUserInfo(
    config: OIDCConfig,
    accessToken: string
): Promise<OIDCUserInfo> {
    const discovery = await discoverOIDC(config.issuer);
    const userInfoUrl = config.userInfoUrl || discovery.userinfo_endpoint;

    const response = await fetch(userInfoUrl, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status}`);
    }

    return response.json();
}

/**
 * Decode and validate ID token (basic validation)
 * For production, use a proper JWT library with JWKS verification
 */
export function decodeIdToken(idToken: string): OIDCUserInfo {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid ID token format");
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload;
}

/**
 * Validate email domain against allowed domains
 */
export function validateEmailDomain(email: string, allowedDomains?: string[]): boolean {
    if (!allowedDomains || allowedDomains.length === 0) {
        return true;
    }

    const domain = email.split("@")[1]?.toLowerCase();
    return allowedDomains.some(d => d.toLowerCase() === domain);
}

/**
 * Handle OIDC callback and create/update user
 */
export async function handleOIDCCallback(
    config: OIDCConfig,
    code: string,
    redirectUri: string
): Promise<{ userId: string; isNewUser: boolean }> {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(config, code, redirectUri);

    // Get user info
    const userInfo = await getUserInfo(config, tokens.accessToken);

    if (!userInfo.email) {
        throw new Error("Email not provided by OIDC provider");
    }

    // Validate email domain if restricted
    if (!validateEmailDomain(userInfo.email, config.allowedDomains)) {
        throw new Error(`Email domain not allowed for SSO: ${userInfo.email}`);
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Check for existing OAuth account
    const existingOAuth = await db.query.oauthAccounts.findFirst({
        where: and(
            eq(schema.oauthAccounts.provider, `oidc:${config.id}`),
            eq(schema.oauthAccounts.providerAccountId, userInfo.sub)
        ),
        with: { user: true },
    });

    if (existingOAuth) {
        // Update tokens
        await db
            .update(schema.oauthAccounts)
            .set({
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            })
            .where(eq(schema.oauthAccounts.id, existingOAuth.id));

        // Update user info if changed
        await db
            .update(schema.users)
            .set({
                displayName: userInfo.name || userInfo.preferred_username,
                avatarUrl: userInfo.picture,
                updatedAt: new Date(),
            })
            .where(eq(schema.users.id, existingOAuth.userId));

        logger.info({ userId: existingOAuth.userId, provider: config.id }, "OIDC login");
        return { userId: existingOAuth.userId, isNewUser: false };
    }

    // Check if user with email exists
    const existingUser = await db.query.users.findFirst({
        where: eq(schema.users.email, userInfo.email),
    });

    if (existingUser) {
        // Link OIDC to existing user
        await db.insert(schema.oauthAccounts).values({
            id: generateId(),
            userId: existingUser.id,
            provider: `oidc:${config.id}`,
            providerAccountId: userInfo.sub,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            createdAt: new Date(),
        });

        logger.info({ userId: existingUser.id, provider: config.id }, "OIDC account linked");
        return { userId: existingUser.id, isNewUser: false };
    }

    // Create new user if allowed
    if (!config.autoCreateUsers) {
        throw new Error("User does not exist and auto-creation is disabled");
    }

    // Generate username from email or name
    let username = userInfo.preferred_username || userInfo.email.split("@")[0];
    const existingUsername = await db.query.users.findFirst({
        where: eq(schema.users.username, username),
    });
    if (existingUsername) {
        username = `${username}-${generateId().slice(0, 8)}`;
    }

    const userId = generateId();

    await db.insert(schema.users).values({
        id: userId,
        username,
        email: userInfo.email,
        displayName: userInfo.name || userInfo.given_name || username,
        avatarUrl: userInfo.picture,
        emailVerified: userInfo.email_verified ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    // Create OAuth link
    await db.insert(schema.oauthAccounts).values({
        id: generateId(),
        userId,
        provider: `oidc:${config.id}`,
        providerAccountId: userInfo.sub,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        createdAt: new Date(),
    });

    // Add to organization if configured
    if (config.organizationId) {
        await db.insert(schema.organizationMembers).values({
            organizationId: config.organizationId,
            userId,
            role: config.defaultRole || "member",
            createdAt: new Date(),
        });
    }

    logger.info({ userId, provider: config.id }, "OIDC user created");
    return { userId, isNewUser: true };
}

/**
 * Get environment-based OIDC config
 */
function getEnvOIDCConfig(): OIDCConfig | null {
    const issuer = process.env.OIDC_ISSUER;
    const clientId = process.env.OIDC_CLIENT_ID;
    const clientSecret = process.env.OIDC_CLIENT_SECRET;

    if (issuer && clientId && clientSecret) {
        return {
            id: "env-oidc",
            name: process.env.OIDC_NAME || "SSO Login",
            issuer,
            clientId,
            clientSecret,
            scopes: (process.env.OIDC_SCOPES || "openid,profile,email").split(","),
            enabled: true,
            autoCreateUsers: true,
            allowedDomains: process.env.OIDC_ALLOWED_DOMAINS?.split(",").filter(Boolean),
            authorizationUrl: process.env.OIDC_AUTH_URL,
            tokenUrl: process.env.OIDC_TOKEN_URL,
            userInfoUrl: process.env.OIDC_USERINFO_URL
        };
    }
    return null;
}

/**
 * Get OIDC config from database or environment
 */
export async function getOIDCConfig(configId: string): Promise<OIDCConfig | null> {
    // Check environment config first
    if (configId === "env-oidc") {
        return getEnvOIDCConfig();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const config = await db.query.ssoConfigs.findFirst({
        where: eq(schema.ssoConfigs.id, configId),
    });

    if (!config) return null;

    return {
        id: config.id,
        name: config.name,
        issuer: config.issuer,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: config.scopes?.split(",") || ["openid", "profile", "email"],
        authorizationUrl: config.authorizationUrl || undefined,
        tokenUrl: config.tokenUrl || undefined,
        userInfoUrl: config.userInfoUrl || undefined,
        enabled: config.enabled ?? false,
        autoCreateUsers: config.autoCreateUsers ?? true,
        allowedDomains: config.allowedDomains?.split(",").filter(Boolean),
        defaultRole: config.defaultRole || undefined,
        organizationId: config.organizationId || undefined,
    };
}

/**
 * List all enabled OIDC providers
 */
export async function getEnabledOIDCProviders(): Promise<OIDCConfig[]> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const configs = await db.query.ssoConfigs.findMany({
        where: eq(schema.ssoConfigs.enabled, true),
    });

    const providers: OIDCConfig[] = configs.map(config => ({
        id: config.id,
        name: config.name,
        issuer: config.issuer,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: config.scopes?.split(",") || ["openid", "profile", "email"],
        enabled: config.enabled ?? false,
        autoCreateUsers: config.autoCreateUsers ?? true,
        allowedDomains: config.allowedDomains?.split(",").filter(Boolean),
        defaultRole: config.defaultRole || undefined,
        organizationId: config.organizationId || undefined,
    }));

    // Add environment provider if configured
    const envConfig = getEnvOIDCConfig();
    if (envConfig) {
        providers.push(envConfig);
    }

    return providers;
}
