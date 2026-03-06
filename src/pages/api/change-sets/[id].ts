import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { getChangeSetWithItems } from "@/lib/dependency-awareness";

const patchSchema = z.object({
  status: z.enum(["draft", "ready", "merged", "abandoned"]).optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(600).nullable().optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const id = params.id;
  if (!id) return notFound("Change set not found");
  const payload = await getChangeSetWithItems(id);
  if (!payload) return notFound("Change set not found");
  if (payload.changeSet.createdById !== user.userId && !user.isAdmin) return forbidden();
  return success(payload);
});

export const PATCH: APIRoute = withErrorHandler(async ({ params, request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();
  const id = params.id;
  if (!id) return notFound("Change set not found");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const existing = await db.query.changeSets?.findFirst({
    where: eq(schema.changeSets.id, id),
  });
  if (!existing) return notFound("Change set not found");
  if (existing.createdById !== user.userId && !user.isAdmin) return forbidden();

  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;

  await db
    .update(schema.changeSets)
    .set({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.changeSets.id, id));

  const updated = await db.query.changeSets?.findFirst({
    where: eq(schema.changeSets.id, id),
  });
  return success(updated);
});
