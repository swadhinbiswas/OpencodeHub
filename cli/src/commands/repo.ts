/**
 * CLI Repo Commands
 * Push, clone, create repositories via API
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { apiCall, getWithAuth, postWithAuth } from "../lib/api.js";
import { getConfig } from "../lib/config.js";

interface RepoInfo {
    id: string;
    name: string;
    fullName: string;
    description?: string;
    visibility: string;
    defaultBranch: string;
    httpCloneUrl: string;
}

/**
 * Get git root directory
 */
function getGitRoot(): string | null {
    try {
        const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
            encoding: "utf-8",
        });
        if (result.status === 0) {
            return result.stdout.trim();
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Get current branch name
 */
function getCurrentBranch(): string {
    const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        encoding: "utf-8",
    });
    return result.stdout.trim() || "main";
}

/**
 * Create a git bundle/packfile of commits to push
 */
function createBundle(gitRoot: string, branch: string): Buffer {
    // Create a bundle of all commits on the branch
    const bundlePath = path.join(gitRoot, ".git", "opencodehub-push.bundle");

    try {
        // Create bundle with all refs
        execSync(`git bundle create "${bundlePath}" --all`, {
            cwd: gitRoot,
            stdio: "pipe",
        });

        const bundle = fs.readFileSync(bundlePath);
        fs.unlinkSync(bundlePath); // Clean up
        return bundle;
    } catch (error) {
        throw new Error(`Failed to create git bundle: ${error}`);
    }
}

/**
 * Get remote origin info to determine repo name
 */
function getRemoteInfo(gitRoot: string): { owner: string; repo: string } | null {
    try {
        const result = spawnSync("git", ["remote", "get-url", "origin"], {
            cwd: gitRoot,
            encoding: "utf-8",
        });

        if (result.status !== 0) {
            return null;
        }

        const url = result.stdout.trim();

        // Parse URL formats:
        // https://host/owner/repo.git
        // git@host:owner/repo.git
        // ssh://git@host:port/owner/repo.git
        const httpsMatch = url.match(/https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/);
        const sshMatch = url.match(/git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/);
        const sshUrlMatch = url.match(/ssh:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/);

        const match = httpsMatch || sshMatch || sshUrlMatch;
        if (match) {
            return { owner: match[1], repo: match[2] };
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Push local repository to OpenCodeHub
 */
export async function pushRepo(options: {
    remote?: string;
    branch?: string;
    force?: boolean;
}): Promise<void> {
    const config = getConfig();

    if (!config.token) {
        console.error("❌ Not logged in. Run 'opencodehub auth login' first.");
        process.exit(1);
    }

    const gitRoot = getGitRoot();
    if (!gitRoot) {
        console.error("❌ Not in a git repository.");
        process.exit(1);
    }

    // Determine repo to push to
    let owner: string;
    let repo: string;

    const remoteInfo = getRemoteInfo(gitRoot);
    if (remoteInfo) {
        owner = remoteInfo.owner;
        repo = remoteInfo.repo;
        console.log(`📦 Pushing to ${owner}/${repo}...`);
    } else {
        // Use directory name as repo name
        repo = path.basename(gitRoot);

        // Get user info
        try {
            const userInfo = await getWithAuth<{ data: { username: string } }>("/api/user");
            owner = userInfo.data.username;
            console.log(`📦 Pushing to ${owner}/${repo}...`);
        } catch {
            console.error("❌ Failed to get user info. Check your login.");
            process.exit(1);
        }
    }

    const branch = options.branch || getCurrentBranch();
    console.log(`🌿 Branch: ${branch}`);

    // Create bundle
    console.log("📦 Creating git bundle...");
    const bundle = createBundle(gitRoot, branch);
    console.log(`   Bundle size: ${(bundle.length / 1024).toFixed(1)} KB`);

    // Upload to API
    console.log("⬆️  Uploading to OpenCodeHub...");

    try {
        const response = await fetch(`${config.serverUrl}/api/repos/${owner}/${repo}/git/push`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.token}`,
                "Content-Type": "application/octet-stream",
                "X-Git-Branch": branch,
                "X-Git-Force": options.force ? "true" : "false",
            },
            body: new Uint8Array(bundle),
        });

        const result = await response.json();

        if (!response.ok) {
            if (response.status === 404) {
                console.error(`❌ Repository ${owner}/${repo} not found.`);
                console.log(`   Create it first: opencodehub repo create ${repo}`);
            } else {
                console.error(`❌ Push failed: ${result.error || response.statusText}`);
            }
            process.exit(1);
        }

        console.log(`✅ Push successful!`);
        if (result.data?.refs) {
            result.data.refs.forEach((ref: string) => {
                console.log(`   → ${ref}`);
            });
        }
    } catch (error) {
        console.error(`❌ Push failed: ${error}`);
        process.exit(1);
    }
}

/**
 * Clone a repository from OpenCodeHub
 */
export async function cloneRepo(
    repoName: string,
    destination?: string
): Promise<void> {
    const config = getConfig();

    // Parse owner/repo format
    let owner: string;
    let repo: string;

    if (repoName.includes("/")) {
        [owner, repo] = repoName.split("/");
    } else {
        // Get current user
        try {
            const userInfo = await getWithAuth<{ data: { username: string } }>("/api/user");
            owner = userInfo.data.username;
            repo = repoName;
        } catch {
            console.error("❌ Failed to get user info. Specify full repo name: owner/repo");
            process.exit(1);
        }
    }

    console.log(`📦 Cloning ${owner}/${repo}...`);

    // Get repo info
    try {
        const repoInfo = await getWithAuth<{ data: RepoInfo }>(`/api/repos/${owner}/${repo}`);
        const cloneUrl = repoInfo.data.httpCloneUrl;
        const dest = destination || repo;

        // Clone using git
        console.log(`⬇️  Cloning to ${dest}/...`);
        execSync(`git clone "${cloneUrl}" "${dest}"`, { stdio: "inherit" });

        console.log(`✅ Cloned successfully!`);
    } catch (error: any) {
        console.error(`❌ Clone failed: ${error.message || error}`);
        process.exit(1);
    }
}

/**
 * Create a new repository on OpenCodeHub
 */
export async function createRepo(options: {
    name: string;
    description?: string;
    visibility?: "public" | "private";
    init?: boolean;
}): Promise<void> {
    const config = getConfig();

    if (!config.token) {
        console.error("❌ Not logged in. Run 'opencodehub auth login' first.");
        process.exit(1);
    }

    console.log(`📦 Creating repository ${options.name}...`);

    try {
        const result = await postWithAuth<{ data: RepoInfo }>("/api/repos", {
            name: options.name,
            description: options.description,
            visibility: options.visibility || "public",
            readme: options.init !== false,
        });

        console.log(`✅ Repository created: ${result.data.fullName}`);
        console.log(`   Clone URL: ${result.data.httpCloneUrl}`);

        // If in a git repo, add as remote
        const gitRoot = getGitRoot();
        if (gitRoot) {
            try {
                execSync(`git remote add opencode "${result.data.httpCloneUrl}"`, {
                    cwd: gitRoot,
                    stdio: "pipe",
                });
                console.log(`   Added remote 'opencode'`);
            } catch {
                // Remote might already exist
            }
        }
    } catch (error: any) {
        console.error(`❌ Failed to create repository: ${error.message || error}`);
        process.exit(1);
    }
}

/**
 * List user's repositories
 */
export async function listRepos(): Promise<void> {
    const config = getConfig();

    if (!config.token) {
        console.error("❌ Not logged in. Run 'opencodehub auth login' first.");
        process.exit(1);
    }

    try {
        const result = await getWithAuth<{ data: RepoInfo[] }>("/api/repos?owner=me");

        if (result.data.length === 0) {
            console.log("No repositories found.");
            return;
        }

        console.log("Your repositories:\n");
        result.data.forEach((repo) => {
            const visibility = repo.visibility === "private" ? "🔒" : "🌐";
            console.log(`${visibility} ${repo.fullName}`);
            if (repo.description) {
                console.log(`   ${repo.description}`);
            }
        });
    } catch (error: any) {
        console.error(`❌ Failed to list repositories: ${error.message || error}`);
        process.exit(1);
    }
}
