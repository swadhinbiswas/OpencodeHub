import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sshKeys } from "@/db/schema";
import { notFound, serverError, success, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  const { id } = params;
  if (!id) {
    return notFound("Key ID is required");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Delete key ensuring it belongs to the user
  const result = await db
    .delete(sshKeys)
    .where(and(eq(sshKeys.id, id), eq(sshKeys.userId, tokenPayload.userId)))
    .returning();

  if (result.length === 0) {
    return notFound("SSH key not found or not authorized");
  }

  logger.info({ userId: tokenPayload.userId, keyId: id }, "SSH key deleted");

  return success({ message: "SSH key deleted successfully" });
});
