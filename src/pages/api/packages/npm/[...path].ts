/**
 * NPM Package Registry Server Protocol Handler
 * GET /api/packages/npm/<package> - Fetch metadata
 * PUT /api/packages/npm/<package> - Publish npm package
 * GET /api/packages/npm/<package>/-/<tarball> - Download tarball
 */

import type { APIRoute } from "astro";
import { getStorage } from "@/lib/storage";
import { getDatabase, schema } from "@/db";
import { and, eq, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { formatNPMPackageMetadata } from "@/lib/packages-server";
import { logger } from "@/lib/logger";

export const ALL: APIRoute = async ({ params, request, url }) => {
    try {
        const path = params.path || "";
        const method = request.method;
        const storage = await getStorage();

        // 0a. CouchDB-style whoami: GET /-/whoami (Bearer PAT)
        if (path === "-/whoami" && method === "GET") {
            const auth = request.headers.get("authorization") || "";
            const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
            if (!token) {
                return new Response(JSON.stringify({ error: "Authentication required" }), {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                });
            }
            const { getUserFromRequest } = await import("@/lib/auth");
            const payload = await getUserFromRequest(request);
            if (!payload) {
                return new Response(JSON.stringify({ error: "Invalid token" }), {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(JSON.stringify({ username: payload.username }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        // 0. CouchDB-style login endpoint (npm adduser / npm login):
        // PUT /-/user/org.couchdb.user:<name> → { ok, token }
        if (path.startsWith("-/user/")) {
            const body = await request.json().catch(() => null);
            const username = body?.name || path.split(":").pop();
            const password = body?.password || "";

            const db = getDatabase() as NodePgDatabase<typeof schema>;
            const user = await db.query.users.findFirst({
                where: eq(schema.users.username, username),
            });
            if (!user || !user.passwordHash) {
                return new Response(
                    JSON.stringify({ error: "invalid username or password" }),
                    { status: 401, headers: { "Content-Type": "application/json" } },
                );
            }

            const { verifyPassword } = await import("@/lib/auth");
            const passwordOk = await verifyPassword(password, user.passwordHash);

            // Also accept a PAT as the "password" (token-style login)
            let patToken: string | null = null;
            if (!passwordOk && password.startsWith("och_")) {
                const { hashPersonalAccessToken, verifyPersonalAccessTokenValue } = await import(
                    "@/lib/personal-access-token"
                );
                const hashed = hashPersonalAccessToken(password);
                const pat = await db.query.personalAccessTokens.findFirst({
                    where: and(
                        eq(schema.personalAccessTokens.userId, user.id),
                        or(
                            eq(schema.personalAccessTokens.token, hashed),
                            eq(schema.personalAccessTokens.token, password),
                        ),
                    ),
                });
                if (pat && verifyPersonalAccessTokenValue(pat.token, password)) {
                    patToken = password;
                }
            }

            if (!passwordOk && !patToken) {
                return new Response(
                    JSON.stringify({ error: "invalid username or password" }),
                    { status: 401, headers: { "Content-Type": "application/json" } },
                );
            }

            // Return the PAT (or a fresh one) as the npm token — npm sends
            // it as Bearer, which the publish route accepts.
            const token = patToken || (await (async () => {
                const { generateId } = await import("@/lib/utils");
                const { hashPersonalAccessToken } = await import(
                    "@/lib/personal-access-token"
                );
                const crypto = await import("node:crypto");
                const raw = `och_${crypto.default.randomBytes(32).toString("base64url")}`;
                await db.insert(schema.personalAccessTokens).values({
                    id: generateId(),
                    userId: user.id,
                    name: "npm-cli",
                    token: hashPersonalAccessToken(raw),
                    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                });
                return raw;
            })());

            logger.info({ username }, "npm registry login");
            return new Response(
                JSON.stringify({
                    ok: true,
                    id: `org.couchdb.user:${username}`,
                    rev: "1-0",
                    token,
                }),
                { status: 201, headers: { "Content-Type": "application/json" } },
            );
        }

        // 1. Tarball download: <pkg>/-/<tarball>.tgz
        if (path.includes("/-/")) {
            const tarballKey = `npm/${path}`;
            const exists = await storage.exists(tarballKey);
            if (!exists) {
                // DB-backed publish stores tarballs at
                // packages/npm/<name>/<version> — look the version up
                const segments = path.split("/");
                const pkgName = segments[0];
                const tarballFile = segments[segments.length - 1];
                const versionMatch = tarballFile.match(/-(\d+\.\d+\.\d+.*)\.tgz$/);
                if (pkgName && versionMatch) {
                    const version = versionMatch[1];
                    const dbKey = `packages/npm/${pkgName}/${version}`;
                    if (await storage.exists(dbKey)) {
                        const data = await storage.get(dbKey);
                        return new Response(new Uint8Array(data), {
                            status: 200,
                            headers: {
                                "Content-Type": "application/octet-stream",
                            },
                        });
                    }
                }
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
