/**
 * External Repository Import Library
 *
 * Imports a repository from another Git hosting service (GitHub, GitLab,
 * Bitbucket, another OpenCodeHub instance, or any public/private git URL)
 * into the requester's account. Mirrors GitHub's "import repository" flow.
 *
 * Security: all URLs are validated with SSRF protection before any network
 * operation (see validateGitCloneUrl). Optional auth tokens are only ever
 * embedded in the ephemeral clone command and are stored encrypted on the
 * repo row (mirrorToken) so scheduled mirror syncs can re-authenticate.
 */

import { existsSync, mkdirSync, rmSync } from "fs";
import { simpleGit } from "simple-git";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { getDatabase, schema } from "@/db";
import { validateFederationSourceUrl } from "@/lib/federation";
import { getDiskPath, initRepoInStorage, finalizeRepoInit, isCloudStorage } from "@/lib/git-storage";
import { getSanitizedGitEnv } from "@/lib/git";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity";
import { encryptWorkflowSecret } from "@/lib/workflow-secret-crypto";
import { isValidRepoName, slugify } from "@/lib/utils";
import { detectOpenCodeHubInstance, getUrlOrigin } from "@/lib/federation";

export const importRepoSchema = z.object({
  sourceUrl: z.string().min(1).max(500),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(["public", "private", "internal"]).default("public"),
  mirror: z.boolean().default(true),
  authToken: z.string().min(1).max(500).optional(),
  authUsername: z.string().min(1).max(255).optional(),
  hasIssues: z.boolean().default(true),
  hasWiki: z.boolean().default(false),
  hasActions: z.boolean().default(true),
});

export type ImportRepoInput = z.infer<typeof importRepoSchema>;

const KNOWN_PROVIDERS: Record<string, string> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
  "codeberg.org": "codeberg",
  "gitea.com": "gitea",
  "gitee.com": "gitee",
};

/**
 * Normalize a user-supplied git URL into a canonical clone URL.
 * Supports:
 *  - https://host/owner/repo[.git]
 *  - git@host:owner/repo.git        (scp-style)
 *  - ssh://git@host/owner/repo.git
 *  - owner/repo shorthand           (defaults to GitHub)
 */
export function normalizeCloneUrl(raw: string): string {
  let url = raw.trim();

  if (url.startsWith("git@") && url.includes(":") && !url.includes("://")) {
    // scp-style → https for https-capable hosts, else leave as-is
    const [userAndHost, pathPart] = url.split(":");
    const host = userAndHost.split("@")[1];
    if (host && KNOWN_PROVIDERS[host] === "github") {
      return `https://github.com/${pathPart}`;
    }
    return url;
  }

  // owner/repo shorthand (no scheme, no host)
  if (!url.includes("://") && !url.includes("@") && /^[^/]+\/[^/]+$/.test(url)) {
    return `https://github.com/${url}`;
  }

  return url;
}

/**
 * Detect the provider from a normalized URL (for display purposes).
 */
export function detectProvider(normalizedUrl: string): string {
  try {
    const parsed = new URL(normalizedUrl);
    return KNOWN_PROVIDERS[parsed.hostname] || "git";
  } catch {
    return "git";
  }
}

/**
 * Derive a valid repo name from a URL's last path segment.
 */
export function deriveRepoName(normalizedUrl: string): string | null {
  try {
    const parsed = new URL(normalizedUrl);
    const segment = parsed.pathname.replace(/\.git$/, "").split("/").filter(Boolean).pop() || "";
    if (!isValidRepoName(segment.toLowerCase())) return null;
    return segment.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Build a clone URL with an embedded token for https remotes.
 * For ssh/git remotes the token cannot be embedded — callers should reject
 * token+ssh combos before reaching here.
 */
function buildAuthenticatedCloneUrl(normalizedUrl: string, token: string, username?: string): string {
  if (!normalizedUrl.startsWith("https://")) return normalizedUrl;
  const parsed = new URL(normalizedUrl);
  const host = parsed.hostname;
  // Provider-specific username conventions for token auth
  let user = username || "oauth2"; // explicit username (federation) or gitlab default
  if (host === "github.com" || host === "bitbucket.org") {
    user = "x-access-token";
  }
  parsed.username = user;
  parsed.password = token;
  return parsed.toString();
}

/**
 * Detect the default branch of a freshly-cloned bare repo.
 */
async function detectDefaultBranch(localRepoPath: string): Promise<string> {
  const git = simpleGit(localRepoPath);
  try {
    const head = await git.raw(["symbolic-ref", "HEAD"]);
    return head.trim().replace(/^refs\/heads\//, "") || "main";
  } catch {
    return "main";
  }
}

export interface ImportRepoResult {
  success: boolean;
  repositoryId?: string;
  owner?: string;
  name?: string;
  url?: string;
  defaultBranch?: string;
  error?: string;
}

/**
 * Import an external repository into the given user's account.
 */
export async function importExternalRepository(
  userId: string,
  input: ImportRepoInput,
): Promise<ImportRepoResult> {
  const db = getDatabase();

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!user) return { success: false, error: "User not found" };

  const normalized = normalizeCloneUrl(input.sourceUrl);
  if (!normalized) {
    return { success: false, error: "Invalid source URL" };
  }

  // SSRF protection: reject private/internal/link-local targets before cloning.
  // Federation-aware: localhost is allowed only when FEDERATION_ALLOW_LOCALHOST=true
  // (needed to fork from a peer instance on the same host / private network).
  const urlCheck = await validateFederationSourceUrl(normalized);
  if (!urlCheck.valid) {
    return { success: false, error: urlCheck.reason };
  }

  // If a token is supplied, the remote must be https so we can embed it safely.
  // Exception: localhost federation testing (FEDERATION_ALLOW_LOCALHOST=true),
  // where http on the loopback interface is trusted.
  const allowLocalhost = process.env.FEDERATION_ALLOW_LOCALHOST === "true";
  if (input.authToken && !normalized.startsWith("https://") && !allowLocalhost) {
    return {
      success: false,
      error: "An auth token can only be used with an https:// source URL",
    };
  }

  // Detect whether the source is another OpenCodeHub instance (federation).
  // If so, record the fork relationship so this instance can push back to it.
  const sourceOrigin = getUrlOrigin(normalized);
  const peerInstance = sourceOrigin
    ? await detectOpenCodeHubInstance(sourceOrigin)
    : null;
  const isExternalFork = peerInstance !== null;

  // Derive repo name
  let name = input.name?.trim().toLowerCase() || deriveRepoName(normalized);
  if (!name) {
    return { success: false, error: "Unable to determine a repository name" };
  }
  if (!isValidRepoName(name)) {
    return {
      success: false,
      error: "Invalid repository name. Use only lowercase letters, numbers, dots, hyphens, and underscores.",
    };
  }

  // Name availability
  const slug = slugify(name);
  const existing = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, user.id),
      eq(schema.repositories.name, name),
    ),
  });
  if (existing) {
    return { success: false, error: `You already have a repository named "${name}"` };
  }

  const repoId = crypto.randomUUID();
  const timestamp = new Date();
  const siteUrl = process.env.SITE_URL || "http://localhost:4321";
  const sshPort = process.env.GIT_SSH_PORT || "2222";
  const diskPath = await getDiskPath(user.username, slug);
  const sshCloneUrl = `ssh://git@localhost:${sshPort}/${user.username}/${slug}.git`;
  const httpCloneUrl = `${siteUrl}/${user.username}/${slug}.git`;

  const provider = detectProvider(normalized);
  const mirrorUrl = normalized; // clean URL (never embeds the token)

  let localGitPath: string | null = null;
  let cloned = false;
  try {
    // Prepare target path (temp for cloud, direct for local)
    localGitPath = await initRepoInStorage(user.username, slug);
    if (existsSync(localGitPath)) {
      rmSync(localGitPath, { recursive: true, force: true });
    }
    mkdirSync(localGitPath, { recursive: true });

    // Clone from the remote. Embed the token transiently for https remotes.
    // Build authenticated URL: for OpenCodeHub upstreams (federation push-back)
    // the upstream username is used for basic-auth; for third-party hosts the
    // provider-specific username convention applies.
    const cloneUrl = input.authToken
      ? buildAuthenticatedCloneUrl(normalized, input.authToken, input.authUsername)
      : normalized;

    const git = simpleGit({
      binary: "git",
      maxConcurrentProcesses: 1,
      unsafe: {
        allowUnsafePack: true,
        allowUnsafeSshCommand: true,
        allowUnsafeCredentialHelper: true,
        allowUnsafeEditor: true,
      },
    });
    git.env(getSanitizedGitEnv());
    await git.clone(cloneUrl, localGitPath, ["--bare"]);
    cloned = true;

    const defaultBranch = await detectDefaultBranch(localGitPath);

    // Remove the origin remote pointing at the source (avoids leaking the
    // embedded token into the stored config) unless mirroring.
    if (!input.mirror) {
      try {
        const bareGit = simpleGit(localGitPath);
        bareGit.env(getSanitizedGitEnv());
        await bareGit.remote(["remove", "origin"]);
      } catch {
        // Non-fatal
      }
    }

    // Encrypt token (if any) for later mirror syncs.
    let encryptedToken: string | null = null;
    if (input.authToken) {
      encryptedToken = encryptWorkflowSecret(input.authToken);
    }

    // Create DB record
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.repositories).values({
      id: repoId,
      name,
      slug,
      description: input.description ?? null,
      ownerId: user.id,
      ownerType: "user",
      visibility: input.visibility,
      defaultBranch,
      diskPath,
      sshCloneUrl,
      httpCloneUrl,
      isMirror: input.mirror,
      mirrorUrl: input.mirror ? mirrorUrl : null,
      mirrorToken: encryptedToken,
      mirrorUsername: input.authUsername || null,
      mirrorSyncStatus: input.mirror ? "success" : null,
      lastMirrorSyncAt: input.mirror ? timestamp : null,
      isFork: isExternalFork,
      forkedFromUrl: isExternalFork ? mirrorUrl : null,
      hasIssues: input.hasIssues,
      hasWiki: input.hasWiki,
      hasActions: input.hasActions,
      size: 0,
      language: null,
      topics: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Upload to cloud storage if needed
    if (await isCloudStorage()) {
      await finalizeRepoInit(user.username, slug);
    }

    logger.info({ userId, repoId, sourceUrl: mirrorUrl, provider }, "External repository imported");

    await logActivity(
      user.id,
      "import_repo",
      "imported",
      "repository",
      repoId,
      repoId,
      { name, sourceUrl: mirrorUrl, provider },
    );

    return {
      success: true,
      repositoryId: repoId,
      owner: user.username,
      name,
      url: `/${user.username}/${slug}`,
      defaultBranch,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ userId, sourceUrl: mirrorUrl, error: message }, "External repo import failed");

    // Cleanup the cloned dir on failure
    if (localGitPath) {
      try {
        if (existsSync(localGitPath)) {
          rmSync(localGitPath, { recursive: true, force: true });
        }
      } catch {
        // Non-fatal
      }
    }
    // Rollback DB row if we got far enough to insert but something after failed
    try {
      // @ts-expect-error - Drizzle multi-db union type issue
      await db.delete(schema.repositories).where(eq(schema.repositories.id, repoId));
    } catch {
      // Non-fatal
    }

    return { success: false, error: message };
  }
}
