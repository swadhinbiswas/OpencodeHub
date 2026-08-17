import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { resolveRepoPath } from "@/lib/git-storage";
import { getUserFromRequest } from "@/lib/auth";
import { success, badRequest, notFound, forbidden, parseBody } from "@/lib/api";
import { z } from "zod";
import { simpleGit } from "simple-git";
import * as fs from "fs/promises";
import * as path from "path";

// GET ?action=tree&branch=main  => returns full recursive tree
// GET ?action=file&branch=main&path=src/index.ts => returns file content
export const GET: APIRoute = async ({ request, params, url }) => {
    const { owner, repo } = params;
    const action = url.searchParams.get("action");
    const branch = url.searchParams.get("branch") || "main";
    const filePath = url.searchParams.get("path") || "";

    // Prevent path traversal
    if (filePath.includes("..")) {
        return badRequest("Invalid path: path traversal detected");
    }

    const db = getDatabase();
    const ownerUser = await db.query.users.findFirst({ where: eq(schema.users.username, owner!) });
    if (!ownerUser) return notFound("Owner not found");

    const repository = await db.query.repositories.findFirst({
        where: and(eq(schema.repositories.ownerId, ownerUser.id), eq(schema.repositories.name, repo!))
    });
    if (!repository) return notFound("Repo not found");

    const tokenPayload = await getUserFromRequest(request);
    if (!(await canReadRepo(tokenPayload?.userId, repository))) return forbidden("Access denied");

    const repoPath = await resolveRepoPath(repository.diskPath);
    const git = simpleGit(repoPath);

    try {
        if (action === "tree") {
            const rawTree = await git.raw(["ls-tree", "-r", "--name-only", branch]);
            const files = rawTree.split("\n").filter(Boolean);
            return success({ files });
        } else if (action === "file") {
            const content = await git.show([`${branch}:${filePath}`]);
            return success({ content });
        }
        return badRequest("Invalid action");
    } catch (e: any) {
        return badRequest(e.message || "Git error");
    }
};

const commitSchema = z.object({
    branch: z.string(),
    message: z.string(),
    files: z.record(z.string(), z.string()), // path -> content
});

export const POST: APIRoute = async ({ request, params }) => {
    const { owner, repo } = params;
    
    const db = getDatabase();
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) return forbidden("Unauthorized");

    const ownerUser = await db.query.users.findFirst({ where: eq(schema.users.username, owner!) });
    const repository = await db.query.repositories.findFirst({
        where: and(eq(schema.repositories.ownerId, ownerUser!.id), eq(schema.repositories.name, repo!))
    });
    
    if (!repository) return notFound("Repo not found");
    if (!(await canWriteRepo(tokenPayload.userId, repository))) return forbidden("No write access");

    const parsed = await parseBody(request, commitSchema);
    if ("error" in parsed) return parsed.error;

    const { branch, message, files } = parsed.data;
    const repoPath = await resolveRepoPath(repository.diskPath);

    try {
        const tempPath = `${repoPath}.worktree-ide-${Date.now()}`;
        await fs.mkdir(tempPath, { recursive: true });
        
        const workGit = simpleGit(tempPath);
        await workGit.clone(repoPath, tempPath, ["--branch", branch]);

        // Write files
        for (const [filePath, content] of Object.entries(files)) {
            const fullPath = path.resolve(path.join(tempPath, filePath));
            if (!fullPath.startsWith(path.resolve(tempPath))) {
                await fs.rm(tempPath, { recursive: true, force: true });
                return badRequest("Invalid file path: path traversal detected");
            }
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content);
            await workGit.add(filePath);
        }

        const user = await db.query.users.findFirst({ where: eq(schema.users.id, tokenPayload.userId) });
        await workGit.addConfig("user.name", user?.displayName || user?.username || "IDE User");
        await workGit.addConfig("user.email", user?.email || "ide@opencodehub.local");

        await workGit.commit(message);
        await workGit.push("origin", branch);

        await fs.rm(tempPath, { recursive: true, force: true });

        // Update repo timestamp
        await (db as any).update(schema.repositories)
            .set({ updatedAt: new Date() })
            .where(eq(schema.repositories.id, repository.id));

        return success({ message: "Committed successfully" });
    } catch (e: any) {
        return badRequest(e.message || "Failed to commit");
    }
};
