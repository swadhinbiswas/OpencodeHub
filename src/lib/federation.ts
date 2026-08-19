/**
 * OpenCodeHub Federation Library
 *
 * Enables two self-hosted OpenCodeHub instances (A and B) to interoperate:
 *
 *  1. A "forks" a repo hosted on B via the normal import flow. The import
 *     layer records `forkedFromUrl` so the relationship is visible.
 *  2. A pushes a branch back to B ("contribute upstream") using the stored
 *     encrypted B-PAT. B's existing git-receive-pack + canWriteRepo gates
 *     permission — B "sets permission" by adding the A user as a collaborator
 *     (or enabling allowExternalPulls for cross-instance PRs).
 *  3. B opens a cross-instance PR whose head lives on A's fork: B fetches the
 *     head ref from A's fork clone URL into the B repo (as a ref under
 *     refs/heads/ so the normal PR pipeline and mergeBranch work), then
 *     records a PR with headRepositoryId = null.
 *
 * SSRF protection applies to every fetch (validateGitCloneUrl). The localhost
 * bypass is only available when FEDERATION_ALLOW_LOCALHOST=true (for
 * two-instance testing on a single host / private network).
 */

import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { simpleGit } from "simple-git";
import { validateGitCloneUrl } from "@/lib/url-validator";
import { getSanitizedGitEnv, getCommit, compareBranches } from "@/lib/git";
import { createSimpleGit } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { logger } from "@/lib/logger";

function federationAllowLocalhost(): boolean {
  return process.env.FEDERATION_ALLOW_LOCALHOST === "true";
}

/**
 * Validate a federation fetch source URL with SSRF protection. Permits
 * localhost/private targets only when FEDERATION_ALLOW_LOCALHOST=true.
 */
export async function validateFederationSourceUrl(
  url: string,
): Promise<{ valid: true } | { valid: false; reason: string }> {
  const result = await validateGitCloneUrl(url, federationAllowLocalhost());
  return result;
}

/**
 * Detect whether a URL belongs to another OpenCodeHub instance by probing its
 * instance metadata endpoint (GET /api/instance). Returns the site URL if the
 * peer is an OpenCodeHub instance, else null. Never throws; network errors
 * simply mean "not an OpenCodeHub instance".
 */
export async function detectOpenCodeHubInstance(
  baseUrl: string,
): Promise<{ siteUrl: string; name: string; version: string } | null> {
  try {
    const parsed = new URL(baseUrl);
    const origin = parsed.origin;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${origin}/api/instance`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.data?.product !== "opencodehub") return null;
    return {
      siteUrl: json.data.siteUrl || origin,
      name: json.data.name || "OpenCodeHub",
      version: json.data.version || "",
    };
  } catch (err) {
    logger.warn({ baseUrl, err }, "Instance detection probe failed");
    return null;
  }
}

/**
 * Derive the origin (scheme://host[:port]) of an upstream repo URL. Used to
 * identify which OpenCodeHub instance hosts the upstream.
 */
export function getUrlOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Fetch a branch from an external fork clone URL into the local B repo so the
 * normal PR machinery (compareBranches, mergeBranch, getCommit) can operate on
 * it. The fetched ref is stored under `refs/heads/<branch>` (never refs/pull
 * or other namespaces, since mergeBranch clones `--branch base` then fetches
 * `origin/<head>`).
 *
 * Returns the fetched head SHA.
 */
export async function fetchExternalHead(
  repoPath: string,
  sourceUrl: string,
  branch: string,
  authToken?: string,
): Promise<{ success: true; sha: string } | { success: false; error: string }> {
  const git = createSimpleGit({ baseDir: repoPath });
  git.env(getSanitizedGitEnv());

  const fetchUrl = authToken && /^https?:\/\//.test(sourceUrl)
    ? embedToken(sourceUrl, authToken)
    : sourceUrl;

  try {
    const res = await git.raw([
      "fetch",
      fetchUrl,
      `+refs/heads/${branch}:refs/heads/${branch}`,
      "--prune",
    ]);
    if (!res && typeof res !== "string") {
      return { success: false, error: "Fetch returned no output" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    logger.error({ sourceUrl, branch, error: message }, "External head fetch failed");
    return { success: false, error: message };
  }

  const commit = await getCommit(repoPath, branch);
  if (!commit) {
    return { success: false, error: `Branch "${branch}" not found after fetch` };
  }
  return { success: true, sha: commit.sha };
}

/**
 * Push a branch from the fork (A) to the upstream repo (B) using the stored
 * B-PAT. B's own git-receive-pack authorizes via canWriteRepo, so B controls
 * whether the A user may contribute.
 */
export async function pushForkToUpstream(
  forkRepoPath: string,
  upstreamCloneUrl: string,
  upstreamToken: string,
  branch: string,
  upstreamUsername?: string,
): Promise<{ success: true; sha: string } | { success: false; error: string }> {
  const git = simpleGit({
    baseDir: forkRepoPath,
    maxConcurrentProcesses: 1,
    unsafe: {
      allowUnsafePack: true,
      allowUnsafeSshCommand: true,
      allowUnsafeCredentialHelper: true,
      allowUnsafeEditor: true,
    },
  });
  git.env(getSanitizedGitEnv());

  const pushUrl = /^https?:\/\//.test(upstreamCloneUrl)
    ? embedToken(upstreamCloneUrl, upstreamToken, upstreamUsername)
    : upstreamCloneUrl;

  try {
    await git.push(pushUrl, `${branch}:${branch}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown push error";
    logger.error({ upstreamCloneUrl, branch, error: message }, "Push to upstream failed");
    return { success: false, error: message };
  }

  const commit = await getCommit(forkRepoPath, branch);
  return { success: true, sha: commit?.sha || "" };
}

/**
 * Fetch the external head and compute PR stats, then create the PR record with
 * headRepositoryId = null (the head lives on a remote fork / instance).
 */
export interface ExternalPullInput {
  repositoryId: string;
  authorId: string;
  sourceUrl: string;
  headBranch: string;
  baseBranch: string;
  title: string;
  body?: string;
  authToken?: string;
  isDraft?: boolean;
}

export async function createExternalPullRequest(
  input: ExternalPullInput,
): Promise<{ success: true; prId: string; number: number; sha: string } | { success: false; error: string }> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.id, input.repositoryId),
  });
  if (!repo) return { success: false, error: "Repository not found" };

  const repoPath = await resolveRepoPath(repo.diskPath);

  const fetchResult = await fetchExternalHead(
    repoPath,
    input.sourceUrl,
    input.headBranch,
    input.authToken,
  );
  if (!fetchResult.success) {
    return { success: false, error: `Failed to fetch head from fork: ${fetchResult.error}` };
  }

  const headCommit = await getCommit(repoPath, input.headBranch);
  const baseCommit = await getCommit(repoPath, input.baseBranch);
  if (!headCommit) return { success: false, error: `Head branch ${input.headBranch} not found` };
  if (!baseCommit) return { success: false, error: `Base branch ${input.baseBranch} not found` };

  const { diffs } = await compareBranches(repoPath, input.baseBranch, input.headBranch);
  let additions = 0;
  let deletions = 0;
  let changedFiles = 0;
  diffs.forEach((diff) => {
    additions += diff.additions;
    deletions += diff.deletions;
    changedFiles++;
  });

  const [{ maxNumber }] = await db
    .select({ maxNumber: sql<number>`coalesce(max(${schema.pullRequests.number}), 0)` })
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.repositoryId, repo.id));

  const number = maxNumber + 1;
  const prId = crypto.randomUUID();

  await db.insert(schema.pullRequests).values({
    id: prId,
    repositoryId: repo.id,
    number,
    title: input.title,
    body: input.body ?? null,
    state: "open",
    isDraft: input.isDraft === true,
    authorId: input.authorId,
    headBranch: input.headBranch,
    headSha: headCommit.sha,
    headRepositoryId: null,
    baseBranch: input.baseBranch,
    baseSha: baseCommit.sha,
    additions,
    deletions,
    changedFiles,
  });

  return { success: true, prId, number, sha: fetchResult.sha };
}

/**
 * Embed a token into an https URL for transient use (never persisted).
 * When `username` is provided (OpenCodeHub federation basic-auth), it is used
 * as the credential username; otherwise provider conventions apply.
 */
export function embedToken(url: string, token: string, username?: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname;
  let user = username || "oauth2";
  if (host === "github.com" || host === "bitbucket.org") {
    user = "x-access-token";
  }
  parsed.username = user;
  parsed.password = token;
  return parsed.toString();
}