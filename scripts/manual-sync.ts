import { join } from "path";
import { readdirSync, statSync } from "fs";
import { uploadRepoToStorage, getStorageRepoPath, isCloudStorage } from "@/lib/git-storage";

const REPOS_DIR = join(process.cwd(), "data", "repos");

async function main() {
    if (!await isCloudStorage()) {
        console.log("Not using cloud storage. No sync needed.");
        return;
    }

    const owners = readdirSync(REPOS_DIR);
    for (const owner of owners) {
        const ownerPath = join(REPOS_DIR, owner);
        if (!statSync(ownerPath).isDirectory()) continue;

        const repos = readdirSync(ownerPath);
        for (const repo of repos) {
            if (!repo.endsWith(".git")) continue;
            const repoName = repo.replace(".git", "");
            console.log(`Syncing ${owner}/${repoName}...`);
            try {
                await uploadRepoToStorage(join(ownerPath, repo), getStorageRepoPath(owner, repoName));
            } catch (e) {
                console.error(`Failed to sync ${owner}/${repoName}:`, e);
            }
        }
    }
}
main().catch(console.error);
