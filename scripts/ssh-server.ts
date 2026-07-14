
import { getDatabase, schema } from "@/db";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { startSSHServer } from "@/lib/ssh";
import { and, eq } from "drizzle-orm";
import { join } from "path";
import { uploadRepoToStorage, getStorageRepoPath, isCloudStorage } from "@/lib/git-storage";

const DATA_DIR = join(process.cwd(), "data");
const REPOS_DIR = process.env.GIT_REPOS_PATH || join(DATA_DIR, "repositories");
const SSH_DIR = join(DATA_DIR, "ssh");
const HOST_KEY_PATH = process.env.GIT_SSH_HOST_KEY || join(SSH_DIR, "host_key");
const SSH_PORT = parseInt(process.env.GIT_SSH_PORT || "2222", 10);

async function main() {
    console.log(`Starting OpenCodeHub SSH Server on port ${SSH_PORT}...`);
    console.log(`Repository path: ${REPOS_DIR}`);

    await startSSHServer({
        port: SSH_PORT,
        hostKeyPath: HOST_KEY_PATH,
        reposPath: REPOS_DIR,
        authenticateUser: async (_, key) => {
            // We ignore the username (usually 'git') and authenticate by key
            const db = getDatabase();

            // Iterate over all keys to find a match
            const allKeys = await db.query.sshKeys.findMany();

            for (const dbKey of allKeys) {
                try {
                    // Parse DB key
                    const parts = dbKey.publicKey.trim().split(" ");
                    if (parts.length < 2) continue;

                    const dbKeyData = Buffer.from(parts[1], 'base64');

                    // Compare buffers
                    if (dbKeyData.equals(key)) {
                        return {
                            valid: true,
                            userId: dbKey.userId,
                            canRead: true, // Specific repo auth is handled in authorizeRepo
                            canWrite: true
                        };
                    }
                } catch (e) {
                    console.error("Error checking key:", e);
                }
            }

            return { valid: false };
        },
        authorizeRepo: async (userId, repoPath, operation) => {
            // repoPath is "owner/repo.git"
            const [ownerName, repoNameWithGit] = repoPath.split("/");
            const repoName = repoNameWithGit.replace(".git", "");

            if (!ownerName || !repoName) return false;

            const db = getDatabase();

            // Find Repo
            const owner = await db.query.users.findFirst({
                where: eq(schema.users.username, ownerName)
            });

            if (!owner) return false;

            const repo = await db.query.repositories.findFirst({
                where: and(
                    eq(schema.repositories.ownerId, owner.id),
                    eq(schema.repositories.name, repoName)
                )
            });

            if (!repo) return false;

            // Check if user is admin
            const user = await db.query.users.findFirst({
                where: eq(schema.users.id, userId)
            });
            const isAdmin = user?.isAdmin === true;

            if (operation === "read") {
                return canReadRepo(userId, repo, { isAdmin });
            } else {
                return canWriteRepo(userId, repo, { isAdmin });
            }
        },
        onPush: async (userId, repoPath, refs) => {
            console.log(`Push received to ${repoPath} from ${userId}`);

            // Resolve Repo ID
            const [ownerName, repoNameWithGit] = repoPath.split("/");
            const repoName = repoNameWithGit.replace(".git", "");

            const db = getDatabase();
            const owner = await db.query.users.findFirst({ where: eq(schema.users.username, ownerName) });
            if (!owner) return;

            const repo = await db.query.repositories.findFirst({
                where: and(eq(schema.repositories.ownerId, owner.id), eq(schema.repositories.name, repoName))
            });

            if (repo) {
                // 1. Run Analysis
                import("@/lib/analysis").then(({ analyzeRepository }) => {
                    analyzeRepository(repo.id, userId).catch(console.error);
                });

                // 2. Trigger Workflows
                import("@/lib/workflows").then(({ triggerRepoWorkflows }) => {
                    refs.forEach(refName => {
                        // refs contains ref names like "refs/heads/main"
                        if (refName.startsWith("refs/heads/")) {
                            // We need to get the latest commit SHA for this ref
                            // For now, trigger with a placeholder - the workflow engine will resolve it
                            triggerRepoWorkflows(repo.id, "HEAD", refName, userId).catch(console.error);
                        }
                    });
                });
                // 3. Sync to Cloud Storage (if enabled)
                if (await isCloudStorage()) {
                    console.log(`[SSH] Syncing ${repoPath} to storage...`);
                    const storagePath = getStorageRepoPath(owner.username, repo.name);
                    const localRepoPath = join(REPOS_DIR, owner.username, `${repo.name}.git`);
                    await uploadRepoToStorage(localRepoPath, storagePath);
                    console.log(`[SSH] Sync complete.`);
                }
            }
        }
    });
}

main().catch(console.error);
