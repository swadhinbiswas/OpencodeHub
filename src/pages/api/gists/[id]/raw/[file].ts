/**
 * Raw Gist File API
 * GET /api/gists/[id]/raw/[file] — raw content of a single file as text/plain
 *
 * Public gists are readable anonymously; secret gists require the owner.
 */

import { getDatabase, schema } from "@/db";
import { gists } from "@/db/schema/gists";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { notFound, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
  const tokenPayload = await getUserFromRequest(request);
  const db = getDatabase() as unknown as NodePgDatabase<typeof schema>;

  const gist = await db.query.gists.findFirst({
    where: eq(gists.id, params.id!),
  });
  if (!gist) return notFound("Gist not found");

  if (!gist.public && gist.userId !== tokenPayload?.userId) {
    if (!tokenPayload) {
      return unauthorized("You must be logged in to view this gist");
    }
    return notFound("Gist not found");
  }

  let filename: string;
  try {
    filename = decodeURIComponent(params.file!);
  } catch {
    filename = params.file!;
  }

  const file = gist.files.find((f) => f.filename === filename);
  if (!file) return notFound("File not found in gist");

  return new Response(file.content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
