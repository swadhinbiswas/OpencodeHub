/**
 * npm Registry API
 * GET  — Package metadata
 * PUT  — Publish package
 */

import { logger } from "@/lib/logger";
import {
  createPackage,
  getNpmPackageMetadata,
  getPackage,
  getVersion,
  publishVersion,
} from "@/lib/packages";
import { getStorage } from "@/lib/storage";
import type { APIRoute } from "astro";
import crypto from "node:crypto";

/** GET /api/packages/npm/:package — npm registry metadata */
export const GET: APIRoute = async ({ params, request }) => {
  const packageName = params.package;
  if (!packageName) {
    return new Response(JSON.stringify({ error: "Package name required" }), {
      status: 400,
    });
  }

  // Extract org from auth or scope
  const orgId = request.headers.get("x-org-id") || "default";

  const metadata = await getNpmPackageMetadata(orgId, packageName);
  if (!metadata) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
    });
  }

  return new Response(JSON.stringify(metadata), {
    headers: { "Content-Type": "application/json" },
  });
};

/** PUT /api/packages/npm/:package — Publish new version */
export const PUT: APIRoute = async ({ params, request }) => {
  const packageName = params.package;
  if (!packageName) {
    return new Response(JSON.stringify({ error: "Package name required" }), {
      status: 400,
    });
  }

  // Authenticate via Basic auth (npm CLI with _auth) or Bearer token
  // (npm CLI with _authToken, or PAT). Legacy x-user-id was spoofable.
  const authHeader = request.headers.get("authorization") || "";
  let userId: string | null = null;
  if (authHeader.startsWith("Basic ")) {
    const { validateBasicAuth } = await import("@/lib/auth-basic");
    userId = await validateBasicAuth(authHeader);
  } else if (authHeader.startsWith("Bearer ")) {
    const { getUserFromRequest } = await import("@/lib/auth");
    const payload = await getUserFromRequest(request);
    userId = payload?.userId || null;
  }
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Authentication required (PAT via Basic or Bearer)" }),
      { status: 401, headers: { "WWW-Authenticate": 'Basic realm="npm"' } },
    );
  }

  try {
    const body = (await request.json()) as Record<string, any>;
    const versions = body.versions || {};
    const versionKeys = Object.keys(versions);

    if (versionKeys.length === 0) {
      return new Response(JSON.stringify({ error: "No versions in payload" }), {
        status: 400,
      });
    }

    // Find or create package (org scoping: default org for now)
    const orgId = "default";
    let pkg = await getPackage(orgId, "npm", packageName);
    if (!pkg) {
      pkg = await createPackage({
        organizationId: orgId,
        type: "npm",
        name: packageName,
        description: body.description,
        createdById: userId,
      });
    }

    // Publish each version
    for (const ver of versionKeys) {
      const existing = await getVersion(pkg.id, ver);
      if (existing) continue; // Skip existing versions

      const versionData = versions[ver];
      const tarball = body._attachments?.[`${packageName}-${ver}.tgz`];

      let storagePath = `packages/npm/${packageName}/${ver}`;
      let digest = "";
      let sizeBytes = 0;

      if (tarball?.data) {
        const buffer = Buffer.from(tarball.data, "base64");
        digest = crypto.createHash("sha256").update(buffer).digest("hex");
        sizeBytes = buffer.length;

        // Store tarball
        const storage = await getStorage();
        await storage.put(storagePath, buffer);
      }

      const distTags = body["dist-tags"] || {};
      const tags: string[] = [];
      for (const [tag, tagVer] of Object.entries(distTags)) {
        if (tagVer === ver) tags.push(tag);
      }

      await publishVersion({
        packageId: pkg.id,
        version: ver,
        digest,
        sizeBytes,
        storagePath,
        metadata: {
          dependencies: versionData.dependencies,
          devDependencies: versionData.devDependencies,
          peerDependencies: versionData.peerDependencies,
          engines: versionData.engines,
          license: versionData.license,
          main: versionData.main,
          types: versionData.types,
          scripts: versionData.scripts,
        },
        tags: tags.length > 0 ? tags : ["latest"],
        publishedById: userId,
      });

      logger.info(
        { package: packageName, version: ver, userId },
        "npm package version published",
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: msg, package: packageName }, "npm publish failed");
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
};
