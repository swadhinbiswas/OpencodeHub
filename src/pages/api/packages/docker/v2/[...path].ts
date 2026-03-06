/**
 * Docker/OCI Registry v2 API
 * Implements the OCI Distribution Spec endpoints
 */

import { logger } from "@/lib/logger";
import {
  checkDockerBlobExists,
  createPackage,
  getDockerManifest,
  getPackage,
  listDockerTags,
  publishVersion,
} from "@/lib/packages";
import { getStorage } from "@/lib/storage";
import type { APIRoute } from "astro";
import crypto from "node:crypto";

/** GET /api/packages/docker/v2 — Registry ping */
export const GET: APIRoute = async ({ url }) => {
  const path = url.pathname.replace("/api/packages/docker/v2", "");

  // Base ping: GET /v2/
  if (!path || path === "/") {
    return new Response(JSON.stringify({}), {
      headers: {
        "Content-Type": "application/json",
        "Docker-Distribution-API-Version": "registry/2.0",
      },
    });
  }

  const orgId = "default"; // Extract from auth in production

  // GET /v2/:name/tags/list
  const tagsMatch = path.match(/^\/([^/]+(?:\/[^/]+)*)\/tags\/list$/);
  if (tagsMatch) {
    const imageName = tagsMatch[1];
    const result = await listDockerTags(orgId, imageName);
    if (!result) {
      return new Response(
        JSON.stringify({ errors: [{ code: "NAME_UNKNOWN" }] }),
        { status: 404 },
      );
    }
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /v2/:name/manifests/:reference
  const manifestMatch = path.match(/^\/([^/]+(?:\/[^/]+)*)\/manifests\/(.+)$/);
  if (manifestMatch) {
    const [, imageName, reference] = manifestMatch;
    const result = await getDockerManifest(orgId, imageName, reference);
    if (!result) {
      return new Response(
        JSON.stringify({ errors: [{ code: "MANIFEST_UNKNOWN" }] }),
        { status: 404 },
      );
    }
    return new Response(JSON.stringify(result.manifest), {
      headers: {
        "Content-Type": "application/vnd.oci.image.manifest.v1+json",
        "Docker-Content-Digest": result.digest,
      },
    });
  }

  // HEAD /v2/:name/blobs/:digest
  const blobMatch = path.match(/^\/([^/]+(?:\/[^/]+)*)\/blobs\/(.+)$/);
  if (blobMatch) {
    const [, imageName, digest] = blobMatch;
    const result = await checkDockerBlobExists(orgId, imageName, digest);
    if (!result.exists) {
      return new Response(null, { status: 404 });
    }
    return new Response(null, {
      status: 200,
      headers: {
        "Docker-Content-Digest": digest,
        "Content-Length": String(result.size || 0),
      },
    });
  }

  return new Response(JSON.stringify({ errors: [{ code: "UNSUPPORTED" }] }), {
    status: 404,
  });
};

/** PUT /v2/:name/manifests/:reference — Push manifest */
export const PUT: APIRoute = async ({ url, request }) => {
  const path = url.pathname.replace("/api/packages/docker/v2", "");
  const orgId = "default";
  const userId = request.headers.get("x-user-id");

  if (!userId) {
    return new Response(
      JSON.stringify({ errors: [{ code: "UNAUTHORIZED" }] }),
      { status: 401 },
    );
  }

  const manifestMatch = path.match(/^\/([^/]+(?:\/[^/]+)*)\/manifests\/(.+)$/);
  if (!manifestMatch) {
    return new Response(JSON.stringify({ errors: [{ code: "UNSUPPORTED" }] }), {
      status: 404,
    });
  }

  const [, imageName, reference] = manifestMatch;

  try {
    const body = await request.text();
    const manifest = JSON.parse(body);
    const digest = `sha256:${crypto.createHash("sha256").update(body).digest("hex")}`;

    // Store manifest
    const storage = await getStorage();
    const storagePath = `packages/docker/${imageName}/manifests/${digest}`;
    await storage.put(storagePath, Buffer.from(body));

    // Find or create package
    let pkg = await getPackage(orgId, "docker", imageName);
    if (!pkg) {
      pkg = await createPackage({
        organizationId: orgId,
        type: "docker",
        name: imageName,
        createdById: userId,
      });
    }

    // Determine version tag
    const isTag = !reference.startsWith("sha256:");
    const version = isTag ? reference : digest.substring(0, 12);

    await publishVersion({
      packageId: pkg.id,
      version,
      digest,
      sizeBytes: body.length,
      storagePath,
      metadata: {
        manifest,
        config: manifest.config,
        layers: manifest.layers,
        mediaType: manifest.mediaType,
      },
      tags: isTag ? [reference] : [],
      publishedById: userId,
    });

    logger.info(
      { image: imageName, reference, digest },
      "Docker manifest pushed",
    );

    return new Response(null, {
      status: 201,
      headers: {
        "Docker-Content-Digest": digest,
        Location: `/v2/${imageName}/manifests/${digest}`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error(
      { error: msg, image: imageName },
      "Docker manifest push failed",
    );
    return new Response(
      JSON.stringify({ errors: [{ code: "MANIFEST_INVALID", message: msg }] }),
      { status: 400 },
    );
  }
};
