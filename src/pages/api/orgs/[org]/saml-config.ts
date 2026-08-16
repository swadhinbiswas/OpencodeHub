import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, forbidden, serverError } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canAdminOrg } from "@/lib/permissions";
import { generateId } from "@/lib/utils";
import { z } from "zod";

/**
 * Org-scoped SAML config CRUD (WS4-04).
 * The samlConfigs table + validation machinery existed but nothing wrote
 * config rows — this API closes the loop.
 */

const samlConfigSchema = z.object({
  entityId: z.string().min(1, "IdP Entity ID required"),
  ssoUrl: z.string().url("IdP SSO URL required"),
  certificate: z.string().min(1, "IdP X.509 certificate required"),
  signatureAlgorithm: z.string().optional().default("RSA-SHA256"),
  digestAlgorithm: z.string().optional().default("SHA256"),
  isEnabled: z.boolean().optional().default(true),
});

// GET: fetch the org's SAML config
export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org } = params;
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org!),
  });
  if (!organization) return notFound("Organization not found");
  if (!(await canAdminOrg(user.userId, organization.id))) return forbidden();

  const config = await db.query.samlConfigs.findFirst({
    where: eq(schema.samlConfigs.organizationId, organization.id),
  });

  return success({
    saml: config
      ? {
          id: config.id,
          entityId: config.entityId,
          ssoUrl: config.ssoUrl,
          signatureAlgorithm: config.signatureAlgorithm,
          digestAlgorithm: config.digestAlgorithm,
          isEnabled: config.isEnabled,
          // certificate is returned (admin-only endpoint); it is needed to
          // configure the SP side and is sensitive — admin gate above
          certificate: config.certificate,
        }
      : null,
  });
});

// POST: create or update the org's SAML config
export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org } = params;
  const body = await request.json();
  const parsed = samlConfigSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", parsed.error);

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org!),
  });
  if (!organization) return notFound("Organization not found");
  if (!(await canAdminOrg(user.userId, organization.id))) return forbidden();

  const existing = await db.query.samlConfigs.findFirst({
    where: eq(schema.samlConfigs.organizationId, organization.id),
  });

  try {
    if (existing) {
      await db
        .update(schema.samlConfigs)
        .set({
          entityId: parsed.data.entityId,
          ssoUrl: parsed.data.ssoUrl,
          certificate: parsed.data.certificate,
          signatureAlgorithm: parsed.data.signatureAlgorithm,
          digestAlgorithm: parsed.data.digestAlgorithm,
          isEnabled: parsed.data.isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(schema.samlConfigs.id, existing.id));
      logger.info({ userId: user.userId, orgId: organization.id }, "SAML config updated");
      return success({ message: "SAML config updated", id: existing.id });
    }

    const id = generateId("saml");
    await db.insert(schema.samlConfigs).values({
      id,
      organizationId: organization.id,
      entityId: parsed.data.entityId,
      ssoUrl: parsed.data.ssoUrl,
      certificate: parsed.data.certificate,
      signatureAlgorithm: parsed.data.signatureAlgorithm,
      digestAlgorithm: parsed.data.digestAlgorithm,
      isEnabled: parsed.data.isEnabled,
    });
    logger.info({ userId: user.userId, orgId: organization.id }, "SAML config created");
    return success({ message: "SAML config created", id });
  } catch (error) {
    logger.error({ err: error }, "Failed to save SAML config");
    return serverError("Failed to save SAML config");
  }
});

// DELETE: remove the org's SAML config
export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org } = params;
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org!),
  });
  if (!organization) return notFound("Organization not found");
  if (!(await canAdminOrg(user.userId, organization.id))) return forbidden();

  await db
    .delete(schema.samlConfigs)
    .where(eq(schema.samlConfigs.organizationId, organization.id));

  return success({ message: "SAML config removed" });
});
