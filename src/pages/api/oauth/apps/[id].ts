import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, success, notFound, forbidden, badRequest } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// DELETE: remove an app (owner or admin)
export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { id } = params;
  if (!id) return badRequest("Missing app id");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const app = await db.query.oauthApps.findFirst({
    where: eq(schema.oauthApps.id, id),
  });
  if (!app) return notFound("App not found");
  if (app.ownerId !== user.userId && !user.isAdmin) {
    return forbidden("Not your app");
  }

  await db.delete(schema.oauthApps).where(eq(schema.oauthApps.id, id));
  return success({ message: "App deleted" });
});
