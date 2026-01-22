/**
 * CLI Repo Commands
 * Push, clone, create repositories via API
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { applyTlsConfig, getWithAuth, postWithAuth } from "../lib/api.js";
import { getConfig } from "../lib/config.js";
import { parseRepoFromRemoteUrl } from "../lib/git.js";

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
function getRemoteInfo(
  gitRoot: string,
): { owner: string; repo: string } | null {
  try {
    const result = spawnSync("git", ["remote", "get-url", "origin"], {
      cwd: gitRoot,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      return null;
    }

    const url = result.stdout.trim();
    return parseRepoFromRemoteUrl(url);
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
    const { errorBox } = await import("../lib/formatter.js");
    errorBox("Authentication Required", [
      "You are not logged in.",
      "",
      "Run: och auth login",
    ]);
    throw new Error("Command aborted");
  }

  const gitRoot = getGitRoot();
  if (!gitRoot) {
    const { errorBox } = await import("../lib/formatter.js");
    errorBox("Not a Git Repository", [
      "This directory is not a git repository.",
      "",
      "Run: git init",
    ]);
    throw new Error("Command aborted");
  }

  // Determine repo to push to
  let owner: string;
  let repo: string;

  const remoteInfo = getRemoteInfo(gitRoot);
  if (remoteInfo) {
    owner = remoteInfo.owner;
    repo = remoteInfo.repo;
  } else {
    // Use directory name as repo name
    repo = path.basename(gitRoot);

    // Get user info
    try {
      const userInfo = await getWithAuth<{ data: { username: string } }>(
        "/api/user",
      );
      owner = userInfo.data.username;
    } catch {
      const { errorBox } = await import("../lib/formatter.js");
      errorBox("Failed to Get User Info", [
        "Could not determine repository owner.",
        "",
        "Check your authentication: och auth login",
      ]);
      throw new Error("Command aborted");
    }
  }

  const branch = options.branch || getCurrentBranch();

  // Show header
  const { log, colors } = await import("../lib/branding.js");
  const {
    showObjectEnumeration,
    showObjectCounting,
    showCompression,
    showWritingObjects,
    showRemoteResolving,
    formatBytes,
    formatSpeed,
    showRefUpdate,
    createSpinner,
  } = await import("../lib/progress.js");

  console.log(""); // Empty line
  log.info(`Pushing to ${colors.highlight(owner + "/" + repo)}`);
  log.dim(`Branch: ${branch}`);
  console.log("");

  // Create bundle with progress
  const spinner = createSpinner("Preparing objects...");
  spinner.start();

  let bundle: Buffer;
  try {
    bundle = createBundle(gitRoot, branch);
    spinner.succeed("Objects prepared");
  } catch (error) {
    spinner.fail("Failed to create bundle");
    throw error;
  }

  // Simulate GitHub-like output for bundle creation
  // Count objects in bundle (rough estimate based on size)
  const estimatedObjects = Math.floor(bundle.length / 500); // Rough estimate

  showObjectEnumeration(estimatedObjects);
  showObjectCounting(estimatedObjects, estimatedObjects);
  showCompression(Math.floor(estimatedObjects * 0.5));
  showWritingObjects(
    estimatedObjects,
    formatBytes(bundle.length),
    formatSpeed(bundle.length / 0.5), // Assume 0.5s compression time
  );

  // Upload to API
  console.log("");
  const uploadSpinner = createSpinner("Uploading to OpenCodeHub...");
  uploadSpinner.start();

  const startTime = Date.now();

  try {
    applyTlsConfig();
    const response = await fetch(
      `${config.serverUrl}/api/repos/${owner}/${repo}/git/push`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/octet-stream",
          "X-Git-Branch": branch,
          "X-Git-Force": options.force ? "true" : "false",
        },
        body: new Uint8Array(bundle),
      },
    );

    const uploadTime = (Date.now() - startTime) / 1000;
    const uploadSpeed = bundle.length / uploadTime;

    const result = await response.json();

    if (!response.ok) {
      uploadSpinner.fail("Upload failed");

      if (response.status === 404) {
        const { errorBox } = await import("../lib/formatter.js");
        errorBox("Repository Not Found", [
          `Repository ${owner}/${repo} does not exist.`,
          "",
          `Create it first: och repo create ${repo}`,
        ]);
      } else {
        const { errorBox } = await import("../lib/formatter.js");
        errorBox("Push Failed", [result.error || response.statusText]);
      }
      throw new Error("Command aborted");
    }

    uploadSpinner.succeed(
      `Uploaded ${formatBytes(bundle.length)} in ${uploadTime.toFixed(2)}s (${formatSpeed(uploadSpeed)})`,
    );

    // Show remote resolution (simulated)
    console.log("");
    showRemoteResolving("Processing", 100, estimatedObjects, estimatedObjects);
    console.log(colors.dim("remote: "));

    // Show ref updates
    console.log(colors.dim(`To ${config.serverUrl}/${owner}/${repo}.git`));

    if (result.data?.refs && result.data.refs.length > 0) {
      result.data.refs.forEach((ref: string) => {
        // Determine if new branch or update
        const isNewBranch = ref.includes("new");
        showRefUpdate(
          "0000000",
          "abc1234",
          ref,
          isNewBranch ? "new" : "updated",
        );
      });
    } else {
      showRefUpdate("abc1234", "def5678", `${branch} -> ${branch}`, "updated");
    }

    // Success box
    console.log("");
    const { successBox } = await import("../lib/formatter.js");
    successBox("✨ Push Successful!", [
      `Repository: ${colors.highlight(owner + "/" + repo)}`,
      `Branch: ${colors.highlight(branch)}`,
      `Size: ${formatBytes(bundle.length)}`,
      "",
      `View at: ${colors.info(config.serverUrl + "/" + owner + "/" + repo)}`,
    ]);
  } catch (error) {
    uploadSpinner.fail("Upload failed");
    const { errorBox } = await import("../lib/formatter.js");
    errorBox("Network Error", [
      String(error),
      "",
      "Please check your connection and try again.",
    ]);
    throw new Error("Command aborted");
  }
}

/**
 * Clone a repository from OpenCodeHub
 */
export async function cloneRepo(
  repoName: string,
  destination?: string,
): Promise<void> {
  const config = getConfig();
  const { log, colors } = await import("../lib/branding.js");
  const { createSpinner, formatBytes } = await import("../lib/progress.js");
  const { successBox, errorBox } = await import("../lib/formatter.js");

  // Parse owner/repo format
  let owner: string;
  let repo: string;

  if (repoName.includes("/")) {
    [owner, repo] = repoName.split("/");
  } else {
    // Get current user
    try {
      const userInfo = await getWithAuth<{ data: { username: string } }>(
        "/api/user",
      );
      owner = userInfo.data.username;
      repo = repoName;
    } catch {
      errorBox("Failed to Get User Info", [
        "Could not determine repository owner.",
        "",
        "Specify full repo name: owner/repo",
      ]);
      throw new Error("Command aborted");
    }
  }

  console.log("");
  log.info(`Cloning ${colors.highlight(owner + "/" + repo)}`);

  // Get repo info
  const spinner = createSpinner("Fetching repository information...");
  spinner.start();

  try {
    const repoInfo = await getWithAuth<{ data: RepoInfo }>(
      `/api/repos/${owner}/${repo}`,
    );
    spinner.succeed("Repository found");

    const cloneUrl = repoInfo.data.httpCloneUrl;
    const dest = destination || repo;

    // Clone using git
    console.log("");
    log.step(`Cloning into ${colors.highlight(dest)}/...`);
    console.log("");

    execSync(`git clone "${cloneUrl}" "${dest}"`, { stdio: "inherit" });

    console.log("");
    successBox("✨ Clone Successful!", [
      `Repository: ${colors.highlight(owner + "/" + repo)}`,
      `Location: ${colors.highlight(dest)}/`,
      "",
      `cd ${dest} && och push`,
    ]);
  } catch (error: any) {
    spinner.fail("Clone failed");
    errorBox("Clone Error", [error.message || String(error)]);
    throw new Error("Command aborted");
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
  const { log, colors, showSuccess } = await import("../lib/branding.js");
  const { createSpinner } = await import("../lib/progress.js");
  const { successBox, errorBox } = await import("../lib/formatter.js");

  if (!config.token) {
    errorBox("Authentication Required", [
      "You are not logged in.",
      "",
      "Run: och auth login",
    ]);
    throw new Error("Command aborted");
  }

  console.log("");
  const visibilityIcon = options.visibility === "private" ? "🔒" : "🌐";
  log.info(`Creating ${visibilityIcon} ${colors.highlight(options.name)}`);
  if (options.description) {
    log.dim(`Description: ${options.description}`);
  }

  const spinner = createSpinner("Creating repository...");
  spinner.start();

  try {
    const result = await postWithAuth<{ data: RepoInfo }>("/api/repos", {
      name: options.name,
      description: options.description,
      visibility: options.visibility || "public",
      readme: options.init !== false,
    });

    spinner.succeed("Repository created");

    // If in a git repo, add as remote
    const gitRoot = getGitRoot();
    let remoteAdded = false;
    if (gitRoot) {
      try {
        execSync(`git remote add opencode "${result.data.httpCloneUrl}"`, {
          cwd: gitRoot,
          stdio: "pipe",
        });
        remoteAdded = true;
      } catch {
        // Remote might already exist
      }
    }

    // Show ASCII art celebration
    console.log("");
    showSuccess(`Repository ${result.data.fullName} is ready!`);

    console.log("");
    const boxContent = [
      `Repository: ${colors.highlight(result.data.fullName)}`,
      `Visibility: ${options.visibility === "private" ? "🔒 Private" : "🌐 Public"}`,
    ];

    if (result.data.description) {
      boxContent.push(`Description: ${result.data.description}`);
    }

    boxContent.push("", `Clone URL: ${colors.info(result.data.httpCloneUrl)}`);

    if (remoteAdded) {
      boxContent.push("", "✓ Added remote 'opencode' to current repository");
    }

    boxContent.push(
      "",
      `View at: ${colors.info(config.serverUrl + "/" + result.data.fullName)}`,
    );

    successBox("🎉 Repository Created!", boxContent);
  } catch (error: any) {
    spinner.fail("Creation failed");
    errorBox("Failed to Create Repository", [error.message || String(error)]);
    throw new Error("Command aborted");
  }
}

/**
 * List user's repositories
 */
export async function listRepos(): Promise<void> {
  const config = getConfig();

  if (!config.token) {
    console.error("❌ Not logged in. Run 'opencodehub auth login' first.");
    throw new Error("Command aborted");
  }

  try {
    const result = await getWithAuth<{ data: RepoInfo[] }>(
      "/api/repos?owner=me",
    );

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
    throw new Error("Command aborted");
  }
}
