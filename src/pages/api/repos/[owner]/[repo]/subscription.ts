import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUserFromRequest, getRepoAndUser } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, serverError } from "@/lib/api";
import { repositoryWatchers } from "@/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";

const WATCH_LEVELS = ["watching", "releases_only", "ignoring"] as const;

// GET: current watch state (null when not watching)
export const GET: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo } = params;
    if (!owner || !repo) return badRequest("Missing parameters");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const repoData = await getRepoAndUser(request, owner, repo);
    if (!repoData) return notFound("Repository not found");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const watcher = await db.query.repositoryWatchers.findFirst({
      where: and(
        eq(repositoryWatchers.repositoryId, repoData.repository.id),
        eq(repositoryWatchers.userId, user.userId),
      ),
    });

    return success({ watching: !!watcher, watchLevel: watcher?.watchLevel || null });
  } catch (error) {
    logger.error({ err: error }, "Failed to get watch state");
    return serverError("Failed to get watch state");
  }
};

// PUT: watch a repository { watchLevel?: "watching" | "releases_only" | "ignoring" }
export const PUT: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo } = params;
    if (!owner || !repo) return badRequest("Missing parameters");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const repoData = await getRepoAndUser(request, owner, repo);
    if (!repoData) return notFound("Repository not found");

    let watchLevel: string = "watching";
    try {
      const body = await request.json();
      if (body.watchLevel !== undefined) watchLevel = body.watchLevel;
    } catch {
      // empty body → default watching
    }
    if (!WATCH_LEVELS.includes(watchLevel as any)) {
      return badRequest("watchLevel must be one of: watching, releases_only, ignoring");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const existing = await db.query.repositoryWatchers.findFirst({
      where: and(
        eq(repositoryWatchers.repositoryId, repoData.repository.id),
        eq(repositoryWatchers.userId, user.userId),
      ),
    });

    if (existing) {
      await db
        .update(repositoryWatchers)
        .set({ watchLevel })
        .where(eq(repositoryWatchers.id, existing.id));
    } else {
      await db.insert(repositoryWatchers).values({
        id: generateId(),
        repositoryId: repoData.repository.id,
        userId: user.userId,
        watchLevel,
      });
    }

    return success({ watching: true, watchLevel });
  } catch (error) {
    logger.error({ err: error }, "Failed to watch repository");
    return serverError("Failed to watch repository");
  }
};

// DELETE: unwatch
export const DELETE: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo } = params;
    if (!owner || !repo) return badRequest("Missing parameters");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const repoData = await getRepoAndUser(request, owner, repo);
    if (!repoData) return notFound("Repository not found");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    await db
      .delete(repositoryWatchers)
      .where(
        and(
          eq(repositoryWatchers.repositoryId, repoData.repository.id),
          eq(repositoryWatchers.userId, user.userId),
        ),
      );

    return success({ watching: false });
  } catch (error) {
    logger.error({ err: error }, "Failed to unwatch repository");
    return serverError("Failed to unwatch repository");
  }
};
