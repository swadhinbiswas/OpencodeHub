/**
 * Git Push API Endpoint
 * Receives git bundles from CLI and unpacks them to storage
 */

import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import { getDatabase } from "@/db";
import { repositories, users } from "@/db/schema";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, notFound, badRequest, serverError, success } from "@/lib/api";
import { canWriteRepo } from "@/lib/permissions";
import { getRepoPath } from "@/lib/utils";
import {
    isCloudStorage,
    acquireRepo,
    releaseRepo,
    getDiskPath,
    parseStoragePath
} from "@/lib/git-storage";
import { spawn, execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";

export const POST: APIRoute = async ({ request, params }) => {
    try {
        // Authenticate user
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const { owner, repo } = params;
        if (!owner || !repo) {
            return badRequest("Missing owner or repo parameter");
        }

        // Remove .git suffix if present
        const repoName = repo.replace(/\.git$/, "");

        const db = getDatabase();

        // Find the repository
        const ownerUser = await db.query.users.findFirst({
            where: eq(users.username, owner),
        });

        if (!ownerUser) {
            return notFound("Repository not found");
        }

        const repository = await db.query.repositories.findFirst({
            where: and(
                eq(repositories.ownerId, ownerUser.id),
                eq(repositories.name, repoName)
            ),
        });

        if (!repository) {
            return notFound("Repository not found");
        }

        // Check write permission
        if (!(await canWriteRepo(tokenPayload.userId, repository))) {
            return unauthorized("You don't have write access to this repository");
        }

        // Get git headers
        const branch = request.headers.get("X-Git-Branch") || "main";
        const force = request.headers.get("X-Git-Force") === "true";

        // Read the bundle from request body
        const bundleData = await request.arrayBuffer();
        if (bundleData.byteLength === 0) {
            return badRequest("Empty bundle");
        }

        // Get local path to the repository
        let repoPath: string;

        if (await isCloudStorage()) {
            const parsed = parseStoragePath(repository.diskPath);
            if (parsed) {
                repoPath = await acquireRepo(parsed.owner, parsed.repoName);
            } else {
                // Fallback to standard path
                repoPath = await acquireRepo(owner, repoName);
            }
        } else {
            repoPath = repository.diskPath;
        }

        // Ensure repo directory exists
        if (!existsSync(repoPath)) {
            return notFound("Repository storage not found. Try creating the repository first.");
        }

        // Write bundle to temp file
        const tempBundlePath = join(repoPath, "incoming.bundle");

        try {
            writeFileSync(tempBundlePath, Buffer.from(bundleData));

            // Verify the bundle
            const verifyResult = spawn("git", ["bundle", "verify", tempBundlePath], {
                cwd: repoPath,
            });

            await new Promise<void>((resolve, reject) => {
                let stderr = "";
                verifyResult.stderr.on("data", (data) => {
                    stderr += data.toString();
                });
                verifyResult.on("close", (code) => {
                    if (code !== 0) {
                        reject(new Error(`Invalid bundle: ${stderr}`));
                    } else {
                        resolve();
                    }
                });
            });

            // Fetch from the bundle
            const refs: string[] = [];

            // Get list of refs in bundle
            const listOutput = execSync(`git bundle list-heads "${tempBundlePath}"`, {
                cwd: repoPath,
                encoding: "utf-8",
            });

            const bundleRefs = listOutput
                .trim()
                .split("\n")
                .filter(Boolean)
                .map((line) => {
                    const [sha, ref] = line.split(/\s+/);
                    return { sha, ref };
                });

            // Fetch each ref from bundle
            for (const { sha, ref } of bundleRefs) {
                try {
                    // Fetch the ref
                    execSync(`git fetch "${tempBundlePath}" "${ref}:${ref}"`, {
                        cwd: repoPath,
                        stdio: "pipe",
                    });
                    refs.push(ref);
                } catch (fetchError) {
                    // Try force update if regular fetch fails
                    if (force) {
                        try {
                            execSync(`git fetch "${tempBundlePath}" "+${ref}:${ref}"`, {
                                cwd: repoPath,
                                stdio: "pipe",
                            });
                            refs.push(`${ref} (force)`);
                        } catch {
                            console.error(`Failed to fetch ${ref}:`, fetchError);
                        }
                    }
                }
            }

            // Clean up temp bundle
            unlinkSync(tempBundlePath);

            // If using cloud storage, sync back
            if (await isCloudStorage()) {
                const parsed = parseStoragePath(repository.diskPath);
                if (parsed) {
                    await releaseRepo(parsed.owner, parsed.repoName, true);
                }
            }

            // Update repository timestamp
            await db
                .update(repositories)
                .set({ updatedAt: new Date().toISOString() })
                .where(eq(repositories.id, repository.id));

            return success({
                message: "Push successful",
                refs,
                branch,
            });
        } catch (error) {
            // Clean up on error
            if (existsSync(tempBundlePath)) {
                try {
                    unlinkSync(tempBundlePath);
                } catch { }
            }
            throw error;
        }
    } catch (error) {
        console.error("Git push error:", error);
        return serverError(`Push failed: ${error instanceof Error ? error.message : error}`);
    }
};
