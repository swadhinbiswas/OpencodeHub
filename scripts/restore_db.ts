import { getDatabase, schema } from "../src/db";
import { hashPassword } from "../src/lib/auth";
import { generateId } from "../src/lib/utils";
import { mkdir } from "fs/promises";
import { join } from "path";
import { simpleGit } from "simple-git";
import { existsSync } from "fs";

async function main() {
    const db = getDatabase();

    // 1. Create User
    const username = "swadhin";
    const password = "password123";
    const passwordHash = await hashPassword(password);
    const userId = generateId("user");

    // Check if user exists (should contain 0, but just in case)
    const existingUser = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.username, username)
    });

    let finalUserId = userId;

    if (!existingUser) {
        console.log("Creating user:", username);
        await db.insert(schema.users).values({
            id: userId,
            username,
            email: "swadhin@example.com",
            passwordHash,
            displayName: "Swadhin",
            isAdmin: true,
            emailVerified: true
        });
        finalUserId = userId;
    } else {
        console.log("User already exists:", existingUser.username);
        finalUserId = existingUser.id;
    }

    // 2. Create Repository
    const repoName = "OpenCodeHub";
    const repoSlug = repoName;
    const repoPath = join(process.cwd(), "data", "repos", username, `${repoName}.git`);

    const existingRepo = await db.query.repositories.findFirst({
        where: (repos, { and, eq }) => and(eq(repos.ownerId, finalUserId), eq(repos.name, repoName))
    });

    if (!existingRepo) {
        console.log("Creating repository:", repoSlug);
        const repoId = generateId("repo");

        await db.insert(schema.repositories).values({
            id: repoId,
            ownerId: finalUserId,
            name: repoName,
            slug: repoSlug,
            description: "The source code of OpenCodeHub",
            visibility: "public",
            defaultBranch: "main",
            diskPath: repoPath,
            httpCloneUrl: `http://localhost:4321/${repoSlug}.git`,
            sshCloneUrl: `ssh://git@localhost:2222/${repoSlug}.git`,
        });
    } else {
        console.log("Repository already exists:", repoSlug);
    }

    // 3. Create Bare Repository on Disk
    console.log("Pushing code to:", repoPath);

    // Ensure parent dir exists
    await mkdir(join(process.cwd(), "data", "repos", username), { recursive: true });

    if (!existsSync(repoPath)) {
        console.log("Cloning bare repository...");
        // Clone current directory as bare repo
        await simpleGit().clone(process.cwd(), repoPath, ["--bare"]);
        console.log("Successfully cloned code to OpenCodeHub repo.");
    } else {
        console.log("Repo directory already exists. Fetching latest changes...");
        simpleGit(repoPath);
        // We can't easily fetch from non-remote. 
        // But since we are pretending to "push", we can use the bare repo as remote for current dir?
        // Or re-clone?
        // Let's just assume if it exists, it might be stale. 
        // But user asked to "push".
        // Let's force update.
        // We can "push" from current dir to that bare repo path.
        const currentGit = simpleGit(process.cwd());
        await currentGit.addRemote("local_opencodehub", repoPath).catch(() => { }); // ignore if exists
        await currentGit.push("local_opencodehub", "HEAD:main", ["--force"]);
        console.log("Pushed latest changes to OpenCodeHub repo.");
    }

    console.log("Done! You can now access the repo at http://localhost:4321/swadhin/OpenCodeHub");
}

main().catch(console.error);
