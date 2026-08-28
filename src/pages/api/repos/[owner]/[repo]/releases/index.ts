/**
 * Releases API - List and create releases
 */
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

const createReleaseSchema = z.object({
  tagName: z.string().min(1),
  name: z.string().min(1),
  body: z.string().optional(),
  isDraft: z.boolean().optional().default(false),
  isPrerelease: z.boolean().optional().default(false),
  targetCommitish: z.string().min(1).optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) return badRequest("Owner and repo required");

  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("User not found");

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repoData) return notFound("Repository not found");

  const hasAccess = await canReadRepo(tokenPayload?.userId, repoData);
  if (!hasAccess) return notFound("Repository not found");

  const releases = await (db as any)
    .select()
    .from(schema.releases)
    .where(eq(schema.releases.repositoryId, repoData.id))
    .orderBy(desc(schema.releases.createdAt));

  // If not authenticated or not writer, filter out drafts
  const canWrite = tokenPayload?.userId
    ? await canWriteRepo(tokenPayload.userId, repoData)
    : false;

  const filtered = canWrite
    ? releases
    : releases.filter((r: any) => !r.isDraft);

  return new Response(JSON.stringify(filtered), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) return badRequest("Owner and repo required");

  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) return unauthorized("Authentication required");

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("User not found");

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repoData) return notFound("Repository not found");

  const canWrite = await canWriteRepo(tokenPayload.userId, repoData);
  if (!canWrite) return forbidden("Write access required");

  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = createReleaseSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const {
    tagName,
    name,
    body: releaseBody,
    isDraft,
    isPrerelease,
    targetCommitish,
  } = parsed.data;

  // Find tag if exists
  let tag = await db.query.tags?.findFirst?.({
    where: and(
      eq(schema.tags.repositoryId, repoData.id),
      eq(schema.tags.name, tagName),
    ),
  });

  // Ensure the git tag exists — create it on the target commitish if missing.
  // All git work happens before any DB writes so a failure doesn't half-create.
  const { simpleGit } = await import("simple-git");
  const { acquireRepo, releaseRepo } = await import("@/lib/git-storage");

  let tagSha: string | null = null;
  try {
    const repoPath = await acquireRepo(owner, repo);
    const git = simpleGit(repoPath);

    // Resolve the target commit: optional commitish or the repo default branch HEAD
    const targetRef = targetCommitish || repoData.defaultBranch || "main";
    let targetSha: string;
    try {
      targetSha = (await git.revparse([targetRef])).trim();
    } catch {
      return badRequest(
        `Target "${targetRef}" not found in repository. Provide a valid branch, tag or commit SHA.`,
      );
    }

    // Idempotency check: skip creation if the tag already exists
    let tagExists = false;
    try {
      await git.raw(["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`]);
      tagExists = true;
    } catch {
      tagExists = false;
    }

    if (!tagExists) {
      const message = releaseBody?.trim() || name;
      await git.tag(["-a", tagName, "-m", message, targetSha]);
    }

    // Resolve the commit the tag points at (annotated tags point to a tag object)
    tagSha = (await git.revparse([`${tagName}^{commit}`])).trim();

    // Tag was created locally — sync back to storage (no-op for local storage)
    await releaseRepo(owner, repo, true);
  } catch (err) {
    return badRequest(
      `Failed to create tag "${tagName}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Link or create the DB tag row
  if (!tag && tagSha) {
    const newTagId = crypto.randomUUID();
    await (db as any).insert(schema.tags).values({
      id: newTagId,
      repositoryId: repoData.id,
      name: tagName,
      commitSha: tagSha,
      message: releaseBody?.trim() || name,
      isRelease: true,
      taggedAt: new Date(),
    });
    tag = { id: newTagId } as typeof schema.tags.$inferSelect;
  }

  const releaseId = crypto.randomUUID();
  await (db as any).insert(schema.releases).values({
    id: releaseId,
    repositoryId: repoData.id,
    tagId: tag?.id || null,
    name,
    body: releaseBody || "",
    isDraft,
    isPrerelease,
    authorId: tokenPayload.userId,
    publishedAt: isDraft ? null : new Date(),
  });

  const release = await db.query.releases?.findFirst?.({
    where: eq(schema.releases.id, releaseId),
  });

  return new Response(JSON.stringify(release), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
