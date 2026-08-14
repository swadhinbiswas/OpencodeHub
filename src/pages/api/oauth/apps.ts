import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, forbidden } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";
import { z } from "zod";
import {
  generateClientCredentials,
  hashClientSecret,
  OAUTH_SCOPES,
} from "@/lib/oauth-provider";

const createAppSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  redirectUris: z.array(z.string().url()).min(1).max(10),
  scopes: z.array(z.enum(OAUTH_SCOPES)).optional(),
  homepageUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
});

// GET: list the user's registered apps
export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const apps = await db.query.oauthApps.findMany({
    where: eq(schema.oauthApps.ownerId, user.userId),
    orderBy: [desc(schema.oauthApps.createdAt)],
  });

  return success({
    apps: apps.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      clientId: a.clientId,
      redirectUris: JSON.parse(a.redirectUris),
      scopes: a.scopes ? JSON.parse(a.scopes) : [],
      homepageUrl: a.homepageUrl,
      iconUrl: a.iconUrl,
      createdAt: a.createdAt,
    })),
  });
});

// POST: register a new OAuth app (client secret shown once)
export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const body = await request.json();
  const parsed = createAppSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", parsed.error);

  const { clientId, clientSecret } = generateClientCredentials();
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const id = generateId("oauth");

  await db.insert(schema.oauthApps).values({
    id,
    ownerId: user.userId,
    name: parsed.data.name,
    description: parsed.data.description,
    clientId,
    clientSecretHash: hashClientSecret(clientSecret),
    redirectUris: JSON.stringify(parsed.data.redirectUris),
    scopes: parsed.data.scopes ? JSON.stringify(parsed.data.scopes) : null,
    homepageUrl: parsed.data.homepageUrl,
    iconUrl: parsed.data.iconUrl,
  });

  logger.info({ userId: user.userId, appId: id }, "OAuth app registered");
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        app: {
          id,
          name: parsed.data.name,
          clientId,
          clientSecret, // shown once
          redirectUris: parsed.data.redirectUris,
          scopes: parsed.data.scopes || [],
        },
      },
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
});
