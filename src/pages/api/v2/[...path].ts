/**
 * OCI Container Registry (Docker v2 API) Dynamic Route Engine
 * Handles manifests, blobs, uploads, and distribution spec operations.
 */

import type { APIRoute } from "astro";
import { getStorage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils";

export const ALL: APIRoute = async ({ params, request, url }) => {
    try {
        const path = params.path || "";
        const method = request.method;
        const storage = await getStorage();

        // Docker Distribution API Header
        const headers = new Headers({
            "Docker-Distribution-Api-Version": "registry/2.0",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, Docker-Distribution-Api-Version",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
        });

        if (method === "OPTIONS") {
            return new Response(null, { status: 204, headers });
        }

        // 1. Manifests Endpoint: <repo>/manifests/<ref>
        if (path.includes("/manifests/")) {
            const parts = path.split("/manifests/");
            const repo = parts[0];
            const ref = parts[1]; // Tag or digest
            const manifestKey = `oci/${repo}/manifests/${ref}.json`;

            if (method === "GET" || method === "HEAD") {
                const exists = await storage.exists(manifestKey);
                if (!exists) {
                    return new Response(
                        JSON.stringify({
                            errors: [
                                {
                                    code: "MANIFEST_UNKNOWN",
                                    message: `Manifest ${ref} not found in ${repo}`,
                                },
                            ],
                        }),
                        { status: 404, headers }
                    );
                }

                if (method === "HEAD") {
                    headers.set("Content-Type", "application/vnd.docker.distribution.manifest.v2+json");
                    return new Response(null, { status: 200, headers });
                }

                const data = await storage.get(manifestKey);
                headers.set("Content-Type", "application/vnd.docker.distribution.manifest.v2+json");
                return new Response(new Uint8Array(data), { status: 200, headers });
            }

            if (method === "PUT") {
                const bodyText = await request.text();
                await storage.put(manifestKey, Buffer.from(bodyText), {
                    contentType: "application/vnd.docker.distribution.manifest.v2+json",
                });

                headers.set("Location", `${url.origin}/api/v2/${repo}/manifests/${ref}`);
                return new Response(null, { status: 201, headers });
            }
        }

        // 2. Blobs Endpoint: <repo>/blobs/<digest>
        if (path.includes("/blobs/") && !path.includes("/uploads/")) {
            const parts = path.split("/blobs/");
            const repo = parts[0];
            const digest = parts[1];
            const blobKey = `oci/${repo}/blobs/${digest}`;

            if (method === "GET" || method === "HEAD") {
                const exists = await storage.exists(blobKey);
                if (!exists) {
                    return new Response(
                        JSON.stringify({
                            errors: [
                                {
                                    code: "BLOB_UNKNOWN",
                                    message: `Blob ${digest} not found in ${repo}`,
                                },
                            ],
                        }),
                        { status: 404, headers }
                    );
                }

                if (method === "HEAD") {
                    headers.set("Content-Type", "application/octet-stream");
                    headers.set("Docker-Content-Digest", digest);
                    return new Response(null, { status: 200, headers });
                }

                const data = await storage.get(blobKey);
                headers.set("Content-Type", "application/octet-stream");
                headers.set("Docker-Content-Digest", digest);
                return new Response(new Uint8Array(data), { status: 200, headers });
            }
        }

        // 3. Blob Uploads Endpoint: <repo>/blobs/uploads/
        if (path.includes("/blobs/uploads")) {
            const parts = path.split("/blobs/uploads");
            const repo = parts[0];
            const uploadId = generateId();

            if (method === "POST") {
                headers.set("Location", `${url.origin}/api/v2/${repo}/blobs/uploads/${uploadId}`);
                headers.set("Range", "0-0");
                headers.set("Docker-Upload-UUID", uploadId);
                return new Response(null, { status: 202, headers });
            }

            if (method === "PATCH" || method === "PUT") {
                const digestParam = url.searchParams.get("digest");
                const arrayBuffer = await request.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                if (digestParam) {
                    const blobKey = `oci/${repo}/blobs/${digestParam}`;
                    await storage.put(blobKey, buffer, {
                        contentType: "application/octet-stream",
                    });
                    headers.set("Location", `${url.origin}/api/v2/${repo}/blobs/${digestParam}`);
                    headers.set("Docker-Content-Digest", digestParam);
                    return new Response(null, { status: 201, headers });
                } else {
                    headers.set("Location", `${url.origin}/api/v2/${repo}/blobs/uploads/${uploadId}`);
                    headers.set("Range", `0-${buffer.length}`);
                    headers.set("Docker-Upload-UUID", uploadId);
                    return new Response(null, { status: 202, headers });
                }
            }
        }

        return new Response(
            JSON.stringify({
                errors: [
                    {
                        code: "UNSUPPORTED",
                        message: "The requested operation is not supported",
                    },
                ],
            }),
            { status: 404, headers }
        );
    } catch (err: any) {
        logger.error({ err: err.message }, "OCI Registry route error");
        return new Response(
            JSON.stringify({
                errors: [{ code: "UNKNOWN", message: err.message }],
            }),
            { status: 500 }
        );
    }
};
