/**
 * SAML SSO Callback
 * Handles SAML assertion response from IdP
 */

import { getDatabase, schema } from "@/db";
import { createSession, createToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  logAuditEvent,
  syncSAMLGroupsToTeams,
  validateSAMLResponse,
  type SAMLConfig,
} from "@/lib/security-advanced";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    const formData = await request.formData();
    const samlResponse = formData.get("SAMLResponse") as string;
    const relayState = formData.get("RelayState") as string | null;

    if (!samlResponse) {
      logger.warn("SAML callback received without SAMLResponse");
      return redirect("/login?error=missing_saml_response");
    }

    // Retrieve the organization from the stored state
    const orgId = cookies.get("saml_org_id")?.value;
    cookies.delete("saml_org_id", { path: "/" });

    if (!orgId) {
      return redirect("/login?error=missing_org_context");
    }

    const db = getDatabase();

    // Find the SAML config for this organization
    const samlConfig = await db.query.samlConfigs?.findFirst({
      where: and(
        eq(schema.samlConfigs.organizationId, orgId),
        eq(schema.samlConfigs.isEnabled, true),
      ),
    });

    if (!samlConfig) {
      logger.warn({ orgId }, "No active SAML config found for organization");
      return redirect("/login?error=saml_not_configured");
    }

    // Validate the SAML response
    const result = await validateSAMLResponse(
      samlConfig as SAMLConfig,
      samlResponse,
    );

    if (!result.valid || !result.user) {
      logger.warn({ orgId, error: result.error }, "SAML validation failed");
      return redirect(
        `/login?error=saml_validation_failed&detail=${encodeURIComponent(result.error || "")}`,
      );
    }

    const { email, name, groups } = result.user;

    // Find or create user by email
    let user = await db.query.users?.findFirst({
      where: eq(schema.users.email, email),
    });

    if (!user) {
      // Auto-provision user from SAML
      const userId = crypto.randomUUID();
      const username = email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "_");

      // @ts-expect-error - Drizzle multi-db union type issue
      await db.insert(schema.users).values({
        id: userId,
        username,
        email,
        displayName: name,
        passwordHash: "", // SAML users don't need password
        avatarUrl: null,
        bio: null,
        isAdmin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      user = await db.query.users?.findFirst({
        where: eq(schema.users.id, userId),
      });

      logger.info({ userId, email }, "Auto-provisioned user via SAML");
    }

    if (!user) {
      return redirect("/login?error=user_creation_failed");
    }

    // Ensure user is a member of the organization
    const orgMember = await db.query.organizationMembers?.findFirst({
      where: and(
        eq(schema.organizationMembers.organizationId, orgId),
        eq(schema.organizationMembers.userId, user.id),
      ),
    });

    if (!orgMember) {
      // @ts-expect-error - Drizzle multi-db union type issue
      await db.insert(schema.organizationMembers).values({
        id: crypto.randomUUID(),
        organizationId: orgId,
        userId: user.id,
        role: "member",
        createdAt: new Date(),
      });
    }

    // Sync SAML groups to internal teams
    if (groups.length > 0) {
      await syncSAMLGroupsToTeams(user.id, orgId, groups);
    }

    // Create session
    const session = await createSession(user.id);
    const token = await createToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin ?? false,
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

    // Audit log
    await logAuditEvent({
      organizationId: orgId,
      userId: user.id,
      action: "auth.saml_login",
      resource: "user",
      resourceId: user.id,
      metadata: { email, groups, provider: "saml" },
      ipAddress: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    });

    logger.info({ userId: user.id, email, orgId }, "SAML login successful");

    // Redirect to relay state or dashboard
    const redirectTo = relayState || "/";
    return redirect(redirectTo);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: msg }, "SAML callback error");
    return redirect("/login?error=saml_error");
  }
};

/** SAML initiation — redirect user to IdP */
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const orgSlug = url.searchParams.get("org");
  if (!orgSlug) {
    return redirect("/login?error=missing_org");
  }

  const db = getDatabase();

  // Find org by slug/name
  const org = await db.query.organizations?.findFirst({
    where: eq(schema.organizations.name, orgSlug),
  });

  if (!org) {
    return redirect("/login?error=org_not_found");
  }

  const samlConfig = await db.query.samlConfigs?.findFirst({
    where: and(
      eq(schema.samlConfigs.organizationId, org.id),
      eq(schema.samlConfigs.isEnabled, true),
    ),
  });

  if (!samlConfig) {
    return redirect("/login?error=saml_not_configured");
  }

  // Import here to avoid circular
  const { generateSAMLRequest } = await import("@/lib/security-advanced");
  const { url: ssoUrl } = await generateSAMLRequest(samlConfig as SAMLConfig);

  // Store org ID for callback
  cookies.set("saml_org_id", org.id, {
    path: "/",
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
  });

  return redirect(ssoUrl);
};
