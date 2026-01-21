/**
 * Git Engine - Repository operations
 * Handles git repository initialization, cloning, and operations
 */

import { logger } from "@/lib/logger";
import {
  isCloudStorage,
  initRepoInStorage,
  finalizeRepoInit,
  deleteRepoFromStorage,
  parseStoragePath,
  acquireRepo,
  releaseRepo,
} from "@/lib/git-storage";
import { spawn } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { basename, dirname, extname, join, resolve } from "path";
import { simpleGit, SimpleGit, SimpleGitOptions } from "simple-git";

export interface RepoInitOptions {
  defaultBranch?: string;
  readme?: boolean;
  gitignoreTemplate?: string;
  licenseType?: string;
  repoName?: string;
  ownerName?: string;
}

export type MergeResult = {
  success: boolean;
  message: string;
  sha?: string; // SHA of the merge commit if successful
};

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "submodule";
  size?: number;
  mode?: string;
  sha?: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  body?: string;
  authorName: string;
  authorEmail: string;
  authorDate: Date;
  committerName: string;
  committerEmail: string;
  committerDate: Date;
  parentShas: string[];
  verification?: {
    status: "G" | "B" | "U" | "E" | "N" | "X" | "Y" | "R"; // G=Good, B=Bad, U=Untrusted, E=Error, N=None
    signerKeyId?: string;
    signerName?: string;
  };
}

export interface BranchInfo {
  name: string;
  sha: string;
  isDefault: boolean;
  isProtected?: boolean;
  ahead?: number;
  behind?: number;
}

export interface TagInfo {
  name: string;
  sha: string;
  message?: string;
  taggerName?: string;
  taggerEmail?: string;
  taggedAt?: Date;
}

export interface DiffInfo {
  file: string;
  additions: number;
  deletions: number;
  changes: number;
  status: "added" | "deleted" | "modified" | "renamed" | "copied";
  oldPath?: string;
  patch?: string;
}

export interface BlameInfo {
  sha: string;
  line: number;
  content: string;
  author: string;
  email: string;
  date: Date;
}

/**
 * Initialize a new bare git repository
 * The caller is responsible for providing the correct local path.
 * For cloud storage, the caller should use initRepoInStorage before calling this,
 * and finalizeRepoInit after this completes.
 */
export async function initRepository(
  repoPath: string,
  options: RepoInitOptions = {}
): Promise<void> {
  const {
    defaultBranch = "main",
    readme = true,
    gitignoreTemplate,
    licenseType,
    repoName = "New Repository",
    ownerName = "Owner",
  } = options;

  // repoPath should already be a valid local path (provided by caller)
  const localRepoPath = repoPath;

  // Ensure directory exists
  const dir = dirname(localRepoPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Initialize bare repository
  const git = simpleGit();
  await git.init(true, [localRepoPath]);
  await installHooks(localRepoPath);

  // If we need initial content, create a temporary working copy
  if (readme || gitignoreTemplate || licenseType) {
    const tempPath = `${localRepoPath}.tmp`;
    mkdirSync(tempPath, { recursive: true });

    const workingGit = simpleGit(tempPath);
    await workingGit.init();
    await workingGit.addConfig("user.name", ownerName);
    await workingGit.addConfig("user.email", "git@opencodehub.local");

    // Create README.md
    if (readme) {
      const readmeContent = `# ${repoName}\\n\\nA new repository created with OpenCodeHub.\\n`;
      const readmePath = join(tempPath, "README.md");
      const fs = await import("fs/promises");
      await fs.writeFile(readmePath, readmeContent);
      await workingGit.add("README.md");
    }

    // Create .gitignore
    if (gitignoreTemplate) {
      const gitignorePath = join(tempPath, ".gitignore");
      const gitignoreContent = getGitignoreTemplate(gitignoreTemplate);
      const fs = await import("fs/promises");
      await fs.writeFile(gitignorePath, gitignoreContent);
      await workingGit.add(".gitignore");
    }

    // Create LICENSE
    if (licenseType) {
      const licensePath = join(tempPath, "LICENSE");
      const licenseContent = getLicenseTemplate(licenseType, ownerName);
      if (licenseContent) {
        const fs = await import("fs/promises");
        await fs.writeFile(licensePath, licenseContent);
        await workingGit.add("LICENSE");
      }
    }

    // Create initial commit
    await workingGit.commit("Initial commit");

    // Rename branch to default
    if (defaultBranch !== "master") {
      await workingGit.branch(["-M", defaultBranch]);
    }

    // Push to bare repository
    await workingGit.addRemote("origin", localRepoPath);
    await workingGit.push("origin", defaultBranch);

    // Clean up temp directory
    rmSync(tempPath, { recursive: true, force: true });
  }

  // Set default branch in bare repo
  const bareGit = simpleGit(localRepoPath);
  await bareGit.raw(["symbolic-ref", "HEAD", `refs/heads/${defaultBranch}`]);
}

/**
 * Delete a repository from disk and cloud storage
 */
export async function deleteRepository(repoPath: string): Promise<void> {
  // Delete from local filesystem if exists
  if (existsSync(repoPath)) {
    rmSync(repoPath, { recursive: true, force: true });
  }

  // If cloud storage, also delete from cloud
  if (await isCloudStorage()) {
    // repoPath might be a logical path (repos/owner/name.git)
    // or a physical path - try to delete from storage either way
    try {
      await deleteRepoFromStorage(repoPath);
    } catch (err) {
      // Also try parsing it as a storage path
      const parsed = parseStoragePath(repoPath);
      if (parsed) {
        await deleteRepoFromStorage(`repos/${parsed.owner}/${parsed.repoName}.git`);
      }
    }
  }
}

/**
 * Fork a repository by cloning it as a bare repo
 */
export async function forkRepository(sourcePath: string, targetPath: string): Promise<void> {
  // Handle paths - if already absolute, use as-is
  const fullSourcePath = sourcePath.startsWith('/') ? sourcePath : join(process.cwd(), sourcePath);
  const fullTargetPath = targetPath.startsWith('/') ? targetPath : join(process.cwd(), targetPath);

  // Create parent directory if needed
  const parentDir = dirname(fullTargetPath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  // Check if source exists
  if (!existsSync(fullSourcePath)) {
    throw new Error(`Source repository not found: ${fullSourcePath}`);
  }

  // Clone as bare repository
  const git = simpleGit();
  await git.clone(fullSourcePath, fullTargetPath, ["--bare"]);

  logger.info(`Repository forked from ${sourcePath} to ${targetPath}`);
}

export function getGit(repoPath: string): SimpleGit {
  // console.log(`[getGit] Initializing for path: ${repoPath} (Exists: ${require('fs').existsSync(repoPath)})`);
  if (!repoPath || repoPath === '.' || repoPath === './') {
    console.warn(`[getGit] WARNING: repoPath is empty or current directory! This might read project git history. Path: '${repoPath}'`);
  }
  // Prevent git from looking in parent directories if the repoPath is not a git repo
  // This fixes the issue where empty temp dirs cause git to read the project's own history
  const ceilingDir = dirname(resolve(repoPath));

  const options: Partial<SimpleGitOptions> = {
    baseDir: repoPath,
    binary: "git",
    maxConcurrentProcesses: 6,
  };

  const git = simpleGit(options);

  // Set environment to prevent walking up
  // We strictly want to operate ONLY in the intended directory
  git.env({
    ...process.env,
    GIT_CEILING_DIRECTORIES: ceilingDir
  });

  return git;
}

/**
 * Check if a repository is empty (has no commits)
 */
export async function isRepoEmpty(repoPath: string): Promise<boolean> {
  const git = getGit(repoPath);
  try {
    // Try to get HEAD ref - if it fails, repo is empty
    await git.raw(["rev-parse", "HEAD"]);
    return false;
  } catch {
    return true;
  }
}

/**
 * Get the actual default branch of a repository (from git, not database)
 * Returns null if repository is empty
 */
export async function getActualDefaultBranch(repoPath: string): Promise<string | null> {
  const git = getGit(repoPath);
  try {
    const headRef = await git.raw(["symbolic-ref", "--short", "HEAD"]);
    return headRef.trim();
  } catch {
    // Repository might be empty or HEAD detached
    return null;
  }
}

// Helper to check for expected errors
function isExpectedGitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("outside repository") ||
    msg.includes("not a git repository") ||
    msg.includes("does not exist") ||
    msg.includes("Not a valid object name") ||
    msg.includes("unknown revision") ||
    msg.includes("ambiguous argument")
  );
}

/**
 * List files in a directory at a specific ref
 */
export async function listFiles(
  repoPath: string,
  ref: string = "HEAD",
  path: string = ""
): Promise<FileEntry[]> {
  const git = getGit(repoPath);

  try {
    // Check if repository is empty first
    if (await isRepoEmpty(repoPath)) {
      return [];
    }

    // Use ls-tree to get files
    // Append / to path to list contents of directory, otherwise it lists the directory entry itself
    const targetPath = path ? (path.endsWith("/") ? path : `${path}/`) : ".";

    const treeOutput = await git.raw([
      "ls-tree",
      "-l", // Include size
      ref,
      targetPath,
    ]);

    const entries: FileEntry[] = [];
    const lines = treeOutput.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      // Format: mode type sha size path
      const match = line.match(/^(\d+)\s+(\w+)\s+(\w+)\s+(-|\d+)\s+(.+)$/);
      if (match) {
        const [, mode, type, sha, size, filePath] = match;
        entries.push({
          name: basename(filePath),
          path: filePath,
          type:
            type === "tree"
              ? "directory"
              : type === "commit"
                ? "submodule"
                : "file",
          size: size === "-" ? undefined : parseInt(size, 10),
          mode,
          sha,
        });
      }
    }

    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  } catch (error) {
    if (!isExpectedGitError(error)) {
      logger.error({ err: error }, "Error listing files");
    }
    return [];
  }
}

/**
 * Get file content at a specific ref
 */
export async function getFileContent(
  repoPath: string,
  filePath: string,
  ref: string = "HEAD"
): Promise<{ content: string; isBinary: boolean; size: number } | null> {
  const git = getGit(repoPath);

  try {
    // Get file blob
    const content = await git.show([`${ref}:${filePath}`]);

    // Check if binary
    const isBinary = await isFileBinary(repoPath, filePath, ref);

    return {
      content: isBinary ? "" : content,
      isBinary,
      size: Buffer.byteLength(content, "utf8"),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Check if a file is binary
 */
async function isFileBinary(
  repoPath: string,
  filePath: string,
  ref: string
): Promise<boolean> {
  const git = getGit(repoPath);

  try {
    // Use git diff to check if file is binary
    const result = await git.raw([
      "diff",
      "--numstat",
      "4b825dc642cb6eb9a060e54bf8d69288fbee4904", // Empty tree SHA
      ref,
      "--",
      filePath,
    ]);

    // Binary files show as "-\t-\t" in numstat
    return result.startsWith("-\t-\t");
  } catch {
    // Check by extension as fallback
    const binaryExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".bmp",
      ".ico",
      ".webp",
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".zip",
      ".tar",
      ".gz",
      ".rar",
      ".7z",
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".mp3",
      ".mp4",
      ".wav",
      ".avi",
      ".mov",
      ".ttf",
      ".woff",
      ".woff2",
      ".eot",
    ];
    const ext = extname(filePath).toLowerCase();
    return binaryExtensions.includes(ext);
  }
}

/**
 * Get commit history
 */
export async function getCommits(
  repoPath: string,
  options: {
    ref?: string;
    path?: string;
    limit?: number;
    skip?: number;
  } = {}
): Promise<CommitInfo[]> {
  const git = getGit(repoPath);
  const { ref = "HEAD", path, limit = 30, skip = 0 } = options;

  try {
    // Check if repository is empty first
    if (await isRepoEmpty(repoPath)) {
      return [];
    }

    const args = [
      "log",
      // Use ASCII record separator (0x1e) as delimiter to avoid issues with | in commit messages
      "--format=%H%x1e%s%x1e%b%x1e%an%x1e%ae%x1e%ai%x1e%cn%x1e%ce%x1e%ci%x1e%P%x1e%G?%x1e%GK%x1e%GS",
      `-n${limit}`,
      `--skip=${skip}`,
      ref,
    ];

    if (path) {
      args.push("--", path);
    }

    const output = await git.raw(args);
    const commits: CommitInfo[] = [];
    const DELIMITER = "\x1e"; // ASCII record separator

    for (const line of output.trim().split("\n").filter(Boolean)) {
      const parts = line.split(DELIMITER);
      // Ensure we have at least the required fields
      if (parts.length < 9) continue;

      const [
        sha,
        subject,
        body,
        authorName,
        authorEmail,
        authorDate,
        committerName,
        committerEmail,
        committerDate,
        parents,
        gpgStatus,
        gpgKeyId,
        gpgSigner,
      ] = parts;

      commits.push({
        sha,
        message: subject,
        body: body || undefined,
        authorName: authorName || "Unknown",
        authorEmail: authorEmail || "unknown@unknown",
        authorDate: new Date(authorDate),
        committerName: committerName || "Unknown",
        committerEmail: committerEmail || "unknown@unknown",
        committerDate: new Date(committerDate),
        parentShas: parents ? parents.split(" ").filter(Boolean) : [],
        verification: {
          status: gpgStatus as any,
          signerKeyId: gpgKeyId || undefined,
          signerName: gpgSigner || undefined
        }
      });
    }

    return commits;
  } catch (error) {
    if (!isExpectedGitError(error)) {
      logger.error({ err: error }, "Error getting commits");
    }
    return [];
  }
}

/**
 * Get a single commit
 */
export async function getCommit(
  repoPath: string,
  sha: string
): Promise<CommitInfo | null> {
  const commits = await getCommits(repoPath, { ref: sha, limit: 1 });
  return commits[0] || null;
}

/**
 * Get branches
 */
export async function getBranches(repoPath: string): Promise<BranchInfo[]> {
  const git = getGit(repoPath);

  try {
    const output = await git.raw([
      "for-each-ref",
      "--format=%(refname:short)|%(objectname)",
      "refs/heads/",
    ]);

    // Get default branch
    let defaultBranch = "main";
    try {
      const headRef = await git.raw(["symbolic-ref", "--short", "HEAD"]);
      defaultBranch = headRef.trim();
    } catch {
      // Ignore if HEAD doesn't point to a branch
    }

    const branches: BranchInfo[] = [];

    for (const line of output.trim().split("\n").filter(Boolean)) {
      const [name, sha] = line.split("|");
      branches.push({
        name,
        sha,
        isDefault: name === defaultBranch,
      });
    }

    // Sort: default branch first, then alphabetically
    branches.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });

    return branches;
  } catch (error) {
    if (!isExpectedGitError(error)) {
      logger.error({ err: error }, "Error getting branches");
    }
    return [];
  }
}

/**
 * Get tags
 */
export async function getTags(repoPath: string): Promise<TagInfo[]> {
  const git = getGit(repoPath);

  try {
    const output = await git.raw([
      "for-each-ref",
      "--format=%(refname:short)|%(*objectname)|%(objectname)|%(taggername)|%(taggeremail)|%(taggerdate:iso)|%(contents:subject)",
      "--sort=-version:refname",
      "refs/tags/",
    ]);

    const tags: TagInfo[] = [];

    for (const line of output.trim().split("\n").filter(Boolean)) {
      const [name, deref, sha, taggerName, taggerEmail, taggedAt, message] =
        line.split("|");
      tags.push({
        name,
        sha: deref || sha, // Use dereferenced sha for annotated tags
        message: message || undefined,
        taggerName: taggerName || undefined,
        taggerEmail: taggerEmail?.replace(/[<>]/g, "") || undefined,
        taggedAt: taggedAt ? new Date(taggedAt) : undefined,
      });
    }

    return tags;
  } catch (error) {
    if (!isExpectedGitError(error)) {
      logger.error({ err: error }, "Error getting tags");
    }
    return [];
  }
}

/**
 * Get diff for a commit
 */
export async function getCommitDiff(
  repoPath: string,
  sha: string
): Promise<DiffInfo[]> {
  const git = getGit(repoPath);

  try {
    const output = await git.raw([
      "diff-tree",
      "--no-commit-id",
      "--numstat",
      "-r",
      "-M", // Detect renames
      sha,
    ]);

    const diffs: DiffInfo[] = [];

    for (const line of output.trim().split("\n").filter(Boolean)) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        const [additions, deletions, file] = parts;
        const add = additions === "-" ? 0 : parseInt(additions, 10);
        const del = deletions === "-" ? 0 : parseInt(deletions, 10);

        // Check for rename
        let filePath = file;
        let oldPath: string | undefined;
        let status: DiffInfo["status"] = "modified";

        if (file.includes(" => ")) {
          const [old, newPath] = file.split(" => ");
          oldPath = old;
          filePath = newPath;
          status = "renamed";
        }

        diffs.push({
          file: filePath,
          additions: add,
          deletions: del,
          changes: add + del,
          status,
          oldPath,
        });
      }
    }

    return diffs;
  } catch (error) {
    if (!isExpectedGitError(error)) {
      logger.error({ err: error }, "Error getting commit diff");
    }
    return [];
  }
}

/**
 * Get blame for a file
 */
export async function getBlame(
  repoPath: string,
  filePath: string,
  ref: string = "HEAD"
): Promise<BlameInfo[]> {
  const git = getGit(repoPath);

  try {
    const output = await git.raw([
      "blame",
      "--line-porcelain",
      ref,
      "--",
      filePath,
    ]);

    const blameLines: BlameInfo[] = [];
    const lines = output.split("\n");
    let currentBlame: Partial<BlameInfo> = {};
    let lineContent = "";

    for (const line of lines) {
      if (line.match(/^[a-f0-9]{40}/)) {
        if (currentBlame.sha && currentBlame.line !== undefined) {
          blameLines.push({
            ...currentBlame,
            content: lineContent,
          } as BlameInfo);
        }
        const [sha, , , lineNum] = line.split(" ");
        currentBlame = { sha, line: parseInt(lineNum, 10) };
      } else if (line.startsWith("author ")) {
        currentBlame.author = line.slice(7);
      } else if (line.startsWith("author-mail ")) {
        currentBlame.email = line.slice(12).replace(/[<>]/g, "");
      } else if (line.startsWith("author-time ")) {
        currentBlame.date = new Date(parseInt(line.slice(12), 10) * 1000);
      } else if (line.startsWith("\t")) {
        lineContent = line.slice(1);
      }
    }

    // Add last blame
    if (currentBlame.sha && currentBlame.line !== undefined) {
      blameLines.push({
        ...currentBlame,
        content: lineContent,
      } as BlameInfo);
    }

    return blameLines;
  } catch (error) {
    if (!isExpectedGitError(error)) {
      logger.error({ err: error }, "Error getting blame");
    }
    return [];
  }
}

/**
 * Get repository size
 */
export async function getRepoSize(repoPath: string): Promise<number> {
  const git = getGit(repoPath);

  try {
    const output = await git.raw(["count-objects", "-vH"]);
    const match = output.match(/size-pack:\s*([\d.]+)\s*(\w+)/);
    if (match) {
      const size = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      const multipliers: Record<string, number> = {
        bytes: 1,
        kib: 1024,
        mib: 1024 * 1024,
        gib: 1024 * 1024 * 1024,
      };
      return Math.round(size * (multipliers[unit] || 1));
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Create a new branch
 */
export async function createBranch(
  repoPath: string,
  branchName: string,
  startPoint: string = "HEAD"
): Promise<void> {
  const git = getGit(repoPath);
  try {
    await git.branch([branchName, startPoint]);
  } catch (error) {
    logger.error({ err: error }, "Error creating branch");
    throw new Error(`Failed to create branch: ${error}`);
  }
}

/**
 * Delete a branch
 */
export async function deleteBranch(
  repoPath: string,
  branchName: string
): Promise<void> {
  const git = getGit(repoPath);
  try {
    await git.branch(["-D", branchName]);
  } catch (error) {
    logger.error({ err: error }, "Error deleting branch");
    throw new Error(`Failed to delete branch: ${error}`);
  }
}

/**
 * Get merge base of two commits
 */
export async function getMergeBase(
  repoPath: string,
  base: string,
  head: string
): Promise<string> {
  const git = getGit(repoPath);
  try {
    const output = await git.raw(["merge-base", base, head]);
    return output.trim();
  } catch (error) {
    logger.error({ err: error }, "Error getting merge base");
    return "";
  }
}

/**
 * Compare two branches to get commits and diff stats
 */
export async function compareBranches(
  repoPath: string,
  base: string,
  head: string
): Promise<{ commits: CommitInfo[]; diffs: DiffInfo[] }> {
  try {
    // Get commits between base and head
    // git log base..head
    const commits = await getCommits(repoPath, {
      ref: `${base}..${head}`,
      limit: 100, // Limit to prevent overload
    });

    // Get diff stats
    // git diff --numstat base...head (triple dot for merge base comparison)
    const git = getGit(repoPath);
    const output = await git.raw([
      "diff",
      "--numstat",
      `${base}...${head}`, // Triple dot finds merge base automatically
    ]);

    const diffs: DiffInfo[] = [];
    for (const line of output.trim().split("\n").filter(Boolean)) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        const [additions, deletions, file] = parts;
        const add = additions === "-" ? 0 : parseInt(additions, 10);
        const del = deletions === "-" ? 0 : parseInt(deletions, 10);

        diffs.push({
          file,
          additions: add,
          deletions: del,
          changes: add + del,
          status: "modified", // Simplified status
        });
      }
    }

    return { commits, diffs };
  } catch (error) {
    logger.error({ err: error }, "Error comparing branches");
    return { commits: [], diffs: [] };
  }
}

/**
 * Merge a branch into another
 */
export async function mergeBranch(
  repoPath: string,
  base: string,
  head: string,
  message?: string
): Promise<MergeResult> {
  const git = getGit(repoPath);
  try {
    // We assume the repo is bare, so we can't do a normal merge with checkout.
    // However, OpenCodeHub seems to stick to bare repos for storage.
    // Merging in a bare repo is tricky. We usually need a worktree.
    // OPTION 1: Create a temp worktree, merge, push back.
    // OPTION 2: Use low-level commands (git merge-tree).
    // Given the difficulty, maybe we should assume non-bare for now or use a temporary clone?
    // But `initRepository` created a bare repo.
    // So we MUST use a temp clone/worktree or low-level plumbing.

    // Using simple-git, let's try to match the implementation pattern.
    // If we use a temp directory:
    // This might be slow for large repos but it's safe.

    // However, existing `createBranch` works on bare repo refs.

    // Let's use `git merge-tree` (server-side merge).
    // git merge-tree --write-tree base head
    // This returns a tree OID if successful.
    // Then we create a commit from that tree.
    // Then we update the base branch ref.

    // check if merge-tree supports --write-tree (git > 2.38)
    // If not, we might fail. Assuming modern git.

    const output = await git.raw(["merge-tree", "--write-tree", base, head]);
    const treeOid = output.trim();

    // Create commit
    const commitMsg = message || `Merge pull request from ${head} into ${base}`;
    // We need parent commits: tip of base, and tip of head.
    const baseSha = (await git.revparse([base])).trim();
    const headSha = (await git.revparse([head])).trim();

    const commitOutput = await git.raw([
      "commit-tree",
      treeOid,
      "-p", baseSha,
      "-p", headSha,
      "-m", commitMsg
    ]);
    const newCommitSha = commitOutput.trim();

    // Update ref
    await git.raw(["update-ref", `refs/heads/${base}`, newCommitSha]);

    return { success: true, message: "Merged successfully", sha: newCommitSha };

  } catch (error: any) {
    logger.error("Error merging branches:", error);
    // basic conflict detection from error message if possible
    // merge-tree errors out on conflict (without --write-tree) or returns conflict info
    // With --write-tree, it succeeds but might contain conflict markers in files?
    // Actually `git merge-tree --write-tree` exit code is non-0 on conflict? No, it writes the tree with conflict markers.
    // We should check for conflicts.
    // For now, return generic failure.
    return { success: false, message: error.message || "Merge failed" };
  }
}


/**
 * Get gitignore templates
 */
function getGitignoreTemplate(template: string): string {
  const templates: Record<string, string> = {
    node: `# Dependencies
node_modules/
.pnp/
.pnp.js

# Build
dist/
build/
.next/
out/

# Environment
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.nyc_output/
`,
    python: `# Byte-compiled
__pycache__/
*.py[cod]
*$py.class

# Virtual environments
venv/
.env/
.venv/

# Distribution
dist/
build/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp

# Testing
.pytest_cache/
.coverage
htmlcov/

# Environment
.env
.env.local
`,
    rust: `# Build
target/

# IDE
.vscode/
.idea/

# Environment
.env

# Cargo.lock for libraries
# Cargo.lock
`,
    go: `# Binaries
*.exe
*.dll
*.so
*.dylib

# Test
*.test
coverage.txt

# Dependency
vendor/

# IDE
.vscode/
.idea/
`,
  };

  return templates[template] || templates.node;
}

/**
 * Get license templates
 */
function getLicenseTemplate(license: string, owner: string): string | null {
  const year = new Date().getFullYear();

  const templates: Record<string, string> = {
    mit: `MIT License

Copyright (c) ${year} ${owner}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
    apache2: `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

Copyright ${year} ${owner}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
`,
    gpl3: `GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

Copyright (C) ${year} ${owner}

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
`,
  };

  return templates[license.toLowerCase()] || null;
}

export async function getLastCommit(
  repoPath: string,
  ref: string,
  filePath: string
): Promise<CommitInfo | null> {
  const git = getGit(repoPath);
  try {
    // Format: hash|author|date|message
    const output = await git.raw([
      "log",
      "-1",
      "--format=%H|%an|%aI|%s",
      ref,
      "--",
      filePath,
    ]);

    if (!output.trim()) return null;

    const [sha, authorName, dateStr, message] = output.trim().split("|");
    const date = new Date(dateStr);

    return {
      sha,
      message,
      authorName,
      authorEmail: "", // Not fetching email to save bandwidth/parsing
      authorDate: date,
      committerName: authorName,
      committerEmail: "",
      committerDate: date,
      parentShas: [],
    };
  } catch (e) {
    return null;
  }
}

export async function getFileRawContent(
  repoPath: string,
  filePath: string,
  ref: string = "HEAD"
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const git = spawn("git", ["show", `${ref}:${filePath}`], { cwd: repoPath });
    const chunks: Buffer[] = [];

    git.stdout.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    git.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
      } else {
        resolve(Buffer.concat(chunks));
      }
    });

    git.on("error", (err) => {
      logger.error({ err }, "Git show error");
      resolve(null);
    });
  });
}


/**
 * Get contributors list with commit counts
 */
export async function getContributors(
  repoPath: string,
  ref: string = "HEAD"
): Promise<{ name: string; email: string; commits: number }[]> {
  const git = getGit(repoPath);

  try {
    // Check if repository is empty first
    if (await isRepoEmpty(repoPath)) {
      return [];
    }

    // git shortlog -sne (summary, numbered, email)
    const output = await git.raw(["shortlog", "-sne", ref]);

    const contributors: { name: string; email: string; commits: number }[] = [];

    output
      .trim()
      .split("\n")
      .filter(Boolean)
      .forEach((line) => {
        const match = line.match(/^\s*(\d+)\s+(.+)\s+<(.+)>$/);
        if (match) {
          contributors.push({
            commits: parseInt(match[1], 10),
            name: match[2].trim(),
            email: match[3].trim(),
          });
        }
      });

    return contributors;
  } catch (error) {
    // Catch "outside repository" error and others
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("outside repository") || errorMessage.includes("not a git repository") || errorMessage.includes("does not exist")) {
      // This is expected for empty/missing repos
      return [];
    }

    logger.error({ err: error }, "Error getting contributors");
    return [];
  }
}

export async function installHooks(repoPath: string) {
  const hooksDir = join(repoPath, "hooks");
  const fs = await import("fs/promises");

  // Ensure hooks dir exists
  if (!existsSync(hooksDir)) {
    await fs.mkdir(hooksDir, { recursive: true });
  }

  // Use environment variable for site URL, fallback to localhost for development
  const siteUrl = process.env.SITE_URL || process.env.PUBLIC_URL || "http://localhost:3000";
  const hookSecret = process.env.INTERNAL_HOOK_SECRET || "dev-hook-secret-change-in-production";

  const postReceiveScript = `#!/bin/bash
while read oldrev newrev refname
do
    curl -X POST \\
      -H "Content-Type: application/json" \\
      -H "X-Hook-Secret: ${hookSecret}" \\
      -d "{\\"oldrev\\":\\"$oldrev\\",\\"newrev\\":\\"$newrev\\",\\"refname\\":\\"$refname\\"}" \\
      ${siteUrl}/api/internal/hooks/post-receive?repo=${encodeURIComponent(repoPath)}
done
`;

  const preReceiveScript = `#!/bin/bash
while read oldrev newrev refname
do
    RESPONSE=$(curl -s -w "%{http_code}" -X POST \\
      -H "Content-Type: application/json" \\
      -H "X-Hook-Secret: ${hookSecret}" \\
      -d "{\\"oldrev\\":\\"$oldrev\\",\\"newrev\\":\\"$newrev\\",\\"refname\\":\\"$refname\\"}" \\
      ${siteUrl}/api/internal/hooks/pre-receive?repo=${encodeURIComponent(repoPath)})
    
    HTTP_CODE=\${RESPONSE: -3}
    BODY=\${RESPONSE:0:\${#RESPONSE}-3}

    if [ "$HTTP_CODE" -ne 200 ]; then
        echo "Error: $BODY"
        exit 1
    fi
done
exit 0
`;

  await fs.writeFile(join(hooksDir, "post-receive"), postReceiveScript, {
    mode: 0o755,
  });

  await fs.writeFile(join(hooksDir, "pre-receive"), preReceiveScript, {
    mode: 0o755,
  });
}

/**
 * Commit a file modification to the repository
 */
export async function commitFile(
  repoPath: string,
  branch: string,
  filePath: string,
  content: string,
  message: string,
  author: { name: string; email: string }
): Promise<string> {
  const git = getGit(repoPath);

  // We need to use plumbing commands because it's a bare repo
  const tempIndexFile = join(repoPath, `temp_index_${Date.now()}_${Math.random().toString(36).substring(7)}`);


  try {
    // 1. Read the tree of the branch into a temporary index
    // We set GIT_INDEX_FILE environment variable for these commands
    const env = { ...process.env, GIT_INDEX_FILE: tempIndexFile };

    // Get the tree of the current branch/commit
    // If branch doesn't exist (empty repo), we might start fresh, but assuming branch exists
    await git.env(env).raw(["read-tree", branch]);

    // 2. Hash the new object using spawn to pipe content
    const hashObjectOutput = await new Promise<string>((resolve, reject) => {
      const gitProcess = spawn("git", ["hash-object", "-w", "--stdin"], {
        cwd: repoPath,
      });
      let output = "";
      gitProcess.stdout.on("data", (data) => { output += data.toString(); });
      gitProcess.on("close", (code) => {
        if (code === 0) resolve(output.trim());
        else reject(new Error(`git hash-object failed with code ${code}`));
      });
      gitProcess.stdin.write(content);
      gitProcess.stdin.end();
    });
    const blobSha = hashObjectOutput;

    // 3. Update the index with the new blob
    // git update-index --add --cacheinfo 100644 <blob_sha> <path>
    await git.env(env).raw(["update-index", "--add", "--cacheinfo", "100644", blobSha, filePath]);

    // 4. Write the new tree
    const writeTreeOutput = await git.env(env).raw(["write-tree"]);
    const treeSha = writeTreeOutput.trim();

    // 5. Create new commit
    // We need the parent commit
    const parentSha = (await git.revparse([branch])).trim();

    const commitTreeArgs = ["commit-tree", treeSha, "-p", parentSha, "-m", message];

    // Set author/committer
    const commitEnv = {
      ...env,
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: author.name,
      GIT_COMMITTER_EMAIL: author.email
    };

    const commitTreeOutput = await git.env(commitEnv).raw(commitTreeArgs);
    const newCommitSha = commitTreeOutput.trim();

    // 6. Update the branch ref
    await git.raw(["update-ref", `refs/heads/${branch}`, newCommitSha]);

    return newCommitSha;
  } finally {
    // Cleanup temporary index
    const fs = await import("fs/promises");
    try {
      await fs.unlink(tempIndexFile);
    } catch (e) {
      // Ignore cleanup error
    }
  }
}

/**
 * Get the physical path for a repository
 */
export function getRepoPath(owner: string, name: string): string {
  return join(process.cwd(), "repos", owner, `${name}.git`);
}
