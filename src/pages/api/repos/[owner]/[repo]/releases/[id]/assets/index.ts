import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest, getRepoAndUser } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, serverError } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";

interface ReleaseAsset {
  id: string;
  name: string;
  size: number;
  contentType: string;
  storageKey: string;
  createdAt: string;
  downloadCount: number;
}

function parseAssets(raw: string | null): ReleaseAsset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getReleaseWithPermission(
  request: Request,
  owner: string,
  repo: string,
  releaseId: string,
): Promise<
  | { ok: true; repoData: any; release: any; db: NodePgDatabase<typeof schema> }
  | { ok: false; response: Response }
> {
  const repoData = await getRepoAndUser(request, owner, repo);
  if (!repoData) return { ok: false, response: notFound("Repository not found") };
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const release = await db.query.releases.findFirst({
    where: and(
      eq(schema.releases.repositoryId, repoData.repository.id),
      eq(schema.releases.id, releaseId),
    ),
  });
  if (!release) return { ok: false, response: notFound("Release not found") };
  return { ok: true, repoData, release, db };
}

// POST: upload an asset (multipart form-data with `file` field)
export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner, repo, id } = params;
  if (!owner || !repo || !id) return badRequest("Missing parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const ctx = await getReleaseWithPermission(request, owner, repo, id);
  if (!ctx.ok) return ctx.response;
  if (ctx.repoData.permission === "read") return unauthorized("Write access required");

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return badRequest("file field required (multipart)");
  if (file.size === 0) return badRequest("Empty file");

  const assetId = generateId("asset");
  const storageKey = `releases/${ctx.release.repositoryId}/${id}/${assetId}-${file.name}`;

  try {
    // Stream to storage via the adapter
    const { getStorage } = await import("@/lib/storage");
    const storage = await getStorage();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { Readable } = await import("node:stream");
    await storage.put(storageKey, Readable.from(buffer), {
      contentType: file.type || "application/octet-stream",
    });

    const assets = parseAssets(ctx.release.assets);
    const asset: ReleaseAsset = {
      id: assetId,
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      storageKey,
      createdAt: new Date().toISOString(),
      downloadCount: 0,
    };
    assets.push(asset);

    await ctx.db
      .update(schema.releases)
      .set({ assets: JSON.stringify(assets), updatedAt: new Date() })
      .where(eq(schema.releases.id, id));

    logger.info({ userId: user.userId, releaseId: id, asset: file.name }, "Release asset uploaded");
    return success({ asset: { ...asset, storageKey: undefined } });
  } catch (error) {
    logger.error({ err: error, releaseId: id }, "Release asset upload failed");
    return serverError("Failed to upload asset");
  }
});

// GET: download an asset by id
export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner, repo, id, assetId } = params;
  if (!owner || !repo || !id || !assetId) return badRequest("Missing parameters");

  const ctx = await getReleaseWithPermission(request, owner, repo, id);
  if (!ctx.ok) return ctx.response;

  const assets = parseAssets(ctx.release.assets);
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return notFound("Asset not found");

  try {
    const { getStorage } = await import("@/lib/storage");
    const storage = await getStorage();
    const data = await storage.get(asset.storageKey);

    // Increment download count
    await ctx.db
      .update(schema.releases)
      .set({
        assets: JSON.stringify(
          assets.map((a) =>
            a.id === assetId ? { ...a, downloadCount: (a.downloadCount || 0) + 1 } : a,
          ),
        ),
      })
      .where(eq(schema.releases.id, id));

    return new Response(new Uint8Array(data) as BodyInit, {
      headers: {
        "Content-Type": asset.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(asset.name)}"`,
        "X-Asset-Size": String(asset.size),
      },
    });
  } catch (error) {
    logger.error({ err: error, assetId }, "Release asset download failed");
    return serverError("Failed to download asset");
  }
});

// DELETE: remove an asset
export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner, repo, id, assetId } = params;
  if (!owner || !repo || !id || !assetId) return badRequest("Missing parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const ctx = await getReleaseWithPermission(request, owner, repo, id);
  if (!ctx.ok) return ctx.response;
  if (ctx.repoData.permission === "read") return unauthorized("Write access required");

  const assets = parseAssets(ctx.release.assets);
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return notFound("Asset not found");

  try {
    const { getStorage } = await import("@/lib/storage");
    const storage = await getStorage();
    await storage.delete(asset.storageKey).catch(() => {});

    await ctx.db
      .update(schema.releases)
      .set({
        assets: JSON.stringify(assets.filter((a) => a.id !== assetId)),
        updatedAt: new Date(),
      })
      .where(eq(schema.releases.id, id));

    return success({ message: "Asset deleted" });
  } catch (error) {
    logger.error({ err: error, assetId }, "Release asset delete failed");
    return serverError("Failed to delete asset");
  }
});
