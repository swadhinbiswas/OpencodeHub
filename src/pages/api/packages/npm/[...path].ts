/**
 * NPM Package Registry Server Protocol Handler
 * GET /api/packages/npm/<package> - Fetch metadata
 * PUT /api/packages/npm/<package> - Publish npm package
 * GET /api/packages/npm/<package>/-/<tarball> - Download tarball
 */

import type { APIRoute } from "astro";
import { getStorage } from "@/lib/storage";
import { formatNPMPackageMetadata } from "@/lib/packages-server";
import { logger } from "@/lib/logger";

export const ALL: APIRoute = async ({ params, request, url }) => {
    try {
        const path = params.path || "";
        const method = request.method;
        const storage = await getStorage();

        // 1. Tarball download: <pkg>/-/<tarball>.tgz
        if (path.includes("/-/")) {
            const tarballKey = `npm/${path}`;
            const exists = await storage.exists(tarballKey);
            if (!exists) {
                return new Response(JSON.stringify({ error: "Package tarball not found" }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const data = await storage.get(tarballKey);
            return new Response(new Uint8Array(data), {
                status: 200,
                headers: {
                    "Content-Type": "application/octet-stream",
                },
            });
        }

        // 2. Package Metadata GET
        if (method === "GET") {
            const metadataKey = `npm/${path}/metadata.json`;
            const exists = await storage.exists(metadataKey);
            if (!exists) {
                return new Response(JSON.stringify({ error: "Package not found" }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const data = await storage.get(metadataKey);
            return new Response(new Uint8Array(data), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        // 3. Package Publish PUT
        if (method === "PUT") {
            const body = await request.json();
            const packageName = body.name || path;
            const versions = body.versions || {};

            const metadataKey = `npm/${packageName}/metadata.json`;
            const formatted = formatNPMPackageMetadata(packageName, versions);

            await storage.put(metadataKey, Buffer.from(JSON.stringify(formatted, null, 2)), {
                contentType: "application/json",
            });

            // Store attachment tarballs if present in publish payload
            if (body._attachments) {
                for (const filename of Object.keys(body._attachments)) {
                    const attachment = body._attachments[filename];
                    if (attachment.data) {
                        const tarballBuffer = Buffer.from(attachment.data, "base64");
                        const tarballKey = `npm/${packageName}/-/${filename}`;
                        await storage.put(tarballKey, tarballBuffer, {
                            contentType: "application/octet-stream",
                        });
                    }
                }
            }

            logger.info({ packageName }, "NPM package published successfully");

            return new Response(JSON.stringify({ ok: true, success: true }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    } catch (err: any) {
        logger.error({ err: err.message }, "NPM Registry route error");
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
