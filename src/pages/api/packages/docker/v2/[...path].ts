/**
 * Docker/OCI Registry v2 API
 * Implements the OCI Distribution Spec endpoints including the full push flow:
 * POST (initiate) -> PATCH (chunks) -> PUT ?digest= (finalize), plus blob GET.
 *
 * Auth: PAT via Basic auth or Bearer token (same model as the npm registry
 * routes). Pulls are anonymous; pushes require authentication.
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
import {
  appendToUpload,
  cancelUpload,
  createUploadSession,
  finalizeUpload,
  getUploadSession,
} from "@/lib/docker-registry-upload";
import { getStorage } from "@/lib/storage";
import type { APIRoute } from "astro";
import crypto from "node:crypto";

const V2_PREFIX = "/api/packages/docker/v2";

function ociError(
  errors: Array<{ code: string; message?: string }>,
  status: number,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify({ errors }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Docker-Distribution-API-Version": "registry/2.0",
      ...headers,
    },
  });
}

function blobStorageKey(imageName: string, digest: string): string {
  return `packages/docker/${imageName}/blobs/${digest}`;
}

/** Authenticate a registry client: Basic (username + PAT/password) or Bearer. */
async function authenticate(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") || "";
  try {
    if (authHeader.startsWith("Basic ")) {
      const { validateBasicAuth } = await import("@/lib/auth-basic");
      return await validateBasicAuth(authHeader);
    }
    if (authHeader.startsWith("Bearer ")) {
      const { getUserFromRequest } = await import("@/lib/auth");
      const payload = await getUserFromRequest(request);
      return payload?.userId ?? null;
    }
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : "unknown" },
      "Docker registry auth failed",
    );
  }
  return null;
}

function unauthorized() {
  return ociError([{ code: "UNAUTHORIZED", message: "Authentication required" }], 401, {
    "WWW-Authenticate": 'Basic realm="opencodehub"',
  });
}

/** GET /api/packages/docker/v2[...] */
export const GET: APIRoute = async ({ url }) => {
  const path = url.pathname.replace(V2_PREFIX, "");

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
      return ociError([{ code: "NAME_UNKNOWN" }], 404);
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
      return ociError([{ code: "MANIFEST_UNKNOWN" }], 404);
    }
    return new Response(JSON.stringify(result.manifest), {
      headers: {
        "Content-Type": "application/vnd.oci.image.manifest.v1+json",
        "Docker-Content-Digest": result.digest,
      },
    });
  }

  // GET /v2/:name/blobs/:digest — stream blob content from storage
  const blobGetMatch = path.match(
    /^\/([^/]+(?:\/[^/]+)*)\/blobs\/(sha256:[a-f0-9]{64})$/,
  );
  if (blobGetMatch) {
    const [, imageName, digest] = blobGetMatch;
    const storage = await getStorage();
    const key = blobStorageKey(imageName, digest);
    if (!(await storage.exists(key))) {
      return ociError([{ code: "BLOB_UNKNOWN" }], 404);
    }
    const obj = await storage.stat(key);
    const stream = await storage.getStream(key);
    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(obj.size ?? 0),
        "Docker-Content-Digest": digest,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  }

  return ociError([{ code: "UNSUPPORTED" }], 404);
};

/** HEAD /api/packages/docker/v2/:name/blobs/:digest */
export const HEAD: APIRoute = async ({ url }) => {
  const path = url.pathname.replace(V2_PREFIX, "");
  const blobMatch = path.match(/^\/([^/]+(?:\/[^/]+)*)\/blobs\/(.+)$/);
  if (!blobMatch) {
    return new Response(null, { status: 404 });
  }
  const [, imageName, digest] = blobMatch;

  // Fast path: content-addressed canonical storage (written by the push flow)
  const storage = await getStorage();
  const key = blobStorageKey(imageName, digest);
  if (await storage.exists(key)) {
    const obj = await storage.stat(key);
    return new Response(null, {
      status: 200,
      headers: {
        "Docker-Content-Digest": digest,
        "Content-Length": String(obj.size ?? 0),
      },
    });
  }

  // Fallback: legacy metadata lookup (pushes made before blob storage existed)
  const orgId = "default";
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
};

/** POST — initiate chunked upload, or monolithic push with ?digest= */
export const POST: APIRoute = async ({ url, request }) => {
  const path = url.pathname.replace(V2_PREFIX, "");
  const userId = await authenticate(request);
  if (!userId) return unauthorized();

  const initMatch = path.match(
    /^\/([^/]+(?:\/[^/]+)*)\/blobs\/uploads\/$/,
  );
  if (!initMatch) {
    return ociError([{ code: "UNSUPPORTED" }], 404);
  }
  const imageName = initMatch[1];

  // Monolithic single-request upload: POST /v2/:name/blobs/uploads/?digest=sha256:...
  const monolithicDigest = url.searchParams.get("digest");
  if (monolithicDigest) {
    const body = Buffer.from(await request.arrayBuffer());
    const computed = `sha256:${crypto.createHash("sha256").update(body).digest("hex")}`;
    if (computed !== monolithicDigest) {
      return ociError([{ code: "DIGEST_INVALID" }], 400);
    }
    const storage = await getStorage();
    const key = blobStorageKey(imageName, computed);
    await storage.put(key, body, { contentType: "application/octet-stream" });
    return new Response(null, {
      status: 201,
      headers: {
        "Docker-Content-Digest": computed,
        Location: `${V2_PREFIX}/${imageName}/blobs/${computed}`,
      },
    });
  }

  // Chunked upload initiation
  const session = await createUploadSession(imageName);
  return new Response(null, {
    status: 202,
    headers: {
      Location: `${V2_PREFIX}/${imageName}/blobs/uploads/${session.id}`,
      "Docker-Upload-UUID": session.id,
      Range: "0-0",
    },
  });
};

/** PATCH — append a chunk to an in-flight upload */
export const PATCH: APIRoute = async ({ url, request }) => {
  const path = url.pathname.replace(V2_PREFIX, "");
  const userId = await authenticate(request);
  if (!userId) return unauthorized();

  const patchMatch = path.match(
    /^\/([^/]+(?:\/[^/]+)*)\/blobs\/uploads\/([a-f0-9-]{36})$/,
  );
  if (!patchMatch) {
    return ociError([{ code: "UNSUPPORTED" }], 404);
  }
  const [, imageName, uploadId] = patchMatch;

  const session = getUploadSession(uploadId);
  if (!session || session.imageName !== imageName) {
    return ociError([{ code: "BLOB_UPLOAD_UNKNOWN" }], 404);
  }

  const chunk = Buffer.from(await request.arrayBuffer());
  const result = await appendToUpload(uploadId, chunk);
  if (!result.ok) {
    return ociError([{ code: result.reason }], 404);
  }

  const end = result.session.size;
  return new Response(null, {
    status: 202,
    headers: {
      Location: `${V2_PREFIX}/${imageName}/blobs/uploads/${uploadId}`,
      "Docker-Upload-UUID": uploadId,
      Range: `0-${end > 0 ? end - 1 : 0}`,
    },
  });
};

/** PUT — finalize an upload with ?digest=, or push a manifest */
export const PUT: APIRoute = async ({ url, request }) => {
  const path = url.pathname.replace(V2_PREFIX, "");
  const userId = await authenticate(request);
  if (!userId) return unauthorized();

  // PUT /v2/:name/blobs/uploads/:uuid?digest=sha256:... — finalize blob upload
  const finalizeMatch = path.match(
    /^\/([^/]+(?:\/[^/]+)*)\/blobs\/uploads\/([a-f0-9-]{36})$/,
  );
  if (finalizeMatch && url.searchParams.has("digest")) {
    const [, imageName, uploadId] = finalizeMatch;
    const digest = url.searchParams.get("digest") || "";
    if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
      return ociError([{ code: "DIGEST_INVALID", message: "malformed digest" }], 400);
    }

    // Support a final chunk carried on the PUT itself
    const hasBody =
      request.headers.get("content-length") &&
      request.headers.get("content-length") !== "0";
    if (hasBody) {
      const chunk = Buffer.from(await request.arrayBuffer());
      const appended = await appendToUpload(uploadId, chunk);
      if (!appended.ok) {
        return ociError([{ code: appended.reason }], 404);
      }
    }

    const result = await finalizeUpload(uploadId, digest, blobStorageKey(imageName, digest));
    if (!result.ok) {
      return ociError([{ code: result.reason }], result.status);
    }

    logger.info(
      { image: imageName, digest: result.digest, size: result.size },
      "Docker blob stored",
    );
    return new Response(null, {
      status: 201,
      headers: {
        "Docker-Content-Digest": result.digest,
        Location: `${V2_PREFIX}/${imageName}/blobs/${result.digest}`,
      },
    });
  }
  if (finalizeMatch) {
    // Upload exists but no digest supplied — cancel per spec ambiguity
    await cancelUpload(finalizeMatch[2]);
    return ociError([{ code: "DIGEST_INVALID", message: "missing digest" }], 400);
  }

  // PUT /v2/:name/manifests/:reference — push manifest
  const manifestMatch = path.match(/^\/([^/]+(?:\/[^/]+)*)\/manifests\/(.+)$/);
  if (!manifestMatch) {
    return ociError([{ code: "UNSUPPORTED" }], 404);
  }

  const [, imageName, reference] = manifestMatch;
  const orgId = "default";

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
    return ociError([{ code: "MANIFEST_INVALID", message: msg }], 400);
  }
};

/** DELETE — abort an in-flight upload */
export const DELETE: APIRoute = async ({ url, request }) => {
  const path = url.pathname.replace(V2_PREFIX, "");
  const userId = await authenticate(request);
  if (!userId) return unauthorized();

  const cancelMatch = path.match(
    /^\/([^/]+(?:\/[^/]+)*)\/blobs\/uploads\/([a-f0-9-]{36})$/,
  );
  if (!cancelMatch) {
    return ociError([{ code: "UNSUPPORTED" }], 404);
  }

  const session = getUploadSession(cancelMatch[2]);
  if (!session || session.imageName !== cancelMatch[1]) {
    return ociError([{ code: "BLOB_UPLOAD_UNKNOWN" }], 404);
  }

  await cancelUpload(cancelMatch[2]);
  return new Response(null, { status: 204 });
};


