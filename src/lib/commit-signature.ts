/**
 * Commit Signature Verification Library
 * GitHub-style "Verified" commit badges
 * Verifies git commit GPG signatures against user-uploaded keys
 * in the gpg_keys table using openpgp (no system keyring needed)
 */

import { getDatabase, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as openpgp from "openpgp";

import { logger } from "./logger";

// Types

export interface CommitVerification {
  /** Commit object contains a gpgsig/gpgsig-sha256 header */
  signed: boolean;
  /** Signature cryptographically valid AND owned by the committer's account */
  verified: boolean;
  /** A public key stored in gpg_keys verified the signature */
  validKeyInDb: boolean;
  /** users.id of the committer matched by committer email, if registered */
  signerUserId: string | null;
}

const UNSIGNED_RESULT: CommitVerification = {
  signed: false,
  verified: false,
  validKeyInDb: false,
  signerUserId: null,
};

// Cache

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;

interface CacheEntry {
  result: CommitVerification;
  expiresAt: number;
}

const verificationCache = new Map<string, CacheEntry>();

function cacheGet(key: string): CommitVerification | null {
  const entry = verificationCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    verificationCache.delete(key);
    return null;
  }
  return entry.result;
}

function cacheSet(key: string, result: CommitVerification): void {
  while (verificationCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = verificationCache.keys().next().value;
    if (oldest === undefined) break;
    verificationCache.delete(oldest);
  }
  verificationCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Signature extraction

/**
 * Parse the raw output of `git cat-file commit <sha>`.
 * Returns the armored signature block and the exact commit bytes with all
 * gpgsig/gpgsig-sha256 header lines stripped (this is what Git signs).
 */
export function extractSignatureFromCommit(
  rawCommitObject: string,
): { signature: string; signedData: string } | null {
  const separatorIndex = rawCommitObject.indexOf("\n\n");
  const headerSection =
    separatorIndex === -1 ? rawCommitObject : rawCommitObject.slice(0, separatorIndex);
  const tail = separatorIndex === -1 ? "" : rawCommitObject.slice(separatorIndex);

  const headerLines = headerSection.split("\n");
  const keptLines: string[] = [];
  let signatureLines: string[] | null = null;
  let collecting = false;

  for (const line of headerLines) {
    if (/^gpgsig(-sha256)?( |$)/.test(line)) {
      if (!signatureLines) {
        signatureLines = [];
        collecting = true;
      } else {
        collecting = false;
        keptLines.push(line);
      }
      continue;
    }
    if (collecting && line.startsWith(" ")) {
      signatureLines!.push(line.slice(1));
      continue;
    }
    collecting = false;
    keptLines.push(line);
  }

  if (!signatureLines || signatureLines.length === 0) {
    return null;
  }

  const signature = signatureLines.join("\n");
  const signedData = `${keptLines.join("\n")}${tail}`;
  return { signature, signedData };
}

function parseCommitterEmail(rawCommitObject: string): string | null {
  const match = rawCommitObject.match(/^committer [^\n]*<([^>]*)>/m);
  return match ? match[1] : null;
}

// Verification

interface VerificationContext {
  db: NodePgDatabase<typeof schema>;
  repoPath: string;
}

async function loadContext(
  owner: string,
  repo: string,
): Promise<VerificationContext | null> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return null;

  const repoRow = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repoRow) return null;

  const { resolveRepoPath } = await import("./git-storage");
  const repoPath = await resolveRepoPath(repoRow.diskPath);
  return { db, repoPath };
}

async function readRawCommit(repoPath: string, sha: string): Promise<string | null> {
  if (!/^[0-9a-f]{7,64}$/i.test(sha)) return null;
  const { simpleGit } = await import("simple-git");
  try {
    return await simpleGit(repoPath).raw(["cat-file", "commit", sha]);
  } catch {
    return null;
  }
}

async function verifyWithKeys(
  ctx: VerificationContext,
  sha: string,
  extracted: { signature: string; signedData: string },
): Promise<CommitVerification> {
  const sig = await openpgp.readSignature({ armoredSignature: extracted.signature });
  const signingKeyIds = sig
    .getSigningKeyIDs()
    .map((id) => id.toHex().toLowerCase())
    .filter(Boolean);

  for (const keyId of signingKeyIds) {
    const cached = cacheGet(`${sha}:${keyId}`);
    if (cached) return cached;
  }

  let keyRows = signingKeyIds.length
    ? await ctx.db.select().from(schema.gpgKeys).where(inArray(schema.gpgKeys.keyId, signingKeyIds))
    : [];
  if (!keyRows.length) {
    keyRows = await ctx.db.select().from(schema.gpgKeys).limit(500);
  }

  const message = await openpgp.createMessage({ text: extracted.signedData });

  for (const row of keyRows) {
    try {
      const keyObj = await openpgp.readKey({ armoredKey: row.publicKey });
      const keyHex = keyObj.getKeyID().toHex().toLowerCase();
      const fingerprint = keyObj.getFingerprint().toLowerCase();
      if (
        signingKeyIds.length &&
        !signingKeyIds.some(
          (id) => keyHex === id || fingerprint.endsWith(id) || keyHex.endsWith(id),
        )
      ) {
        continue;
      }

      const result = await openpgp.verify({
        message,
        verificationKeys: keyObj,
        signature: sig,
      });
      const firstSignature = result.signatures[0];
      if (!firstSignature) continue;

      const isValid = await firstSignature.verified.then(
        () => true,
        () => false,
      );
      if (!isValid) continue;

      const committerEmail = parseCommitterEmail(extracted.signedData);
      const signerUser = committerEmail
        ? await ctx.db.query.users.findFirst({
            where: eq(schema.users.email, committerEmail),
          })
        : null;

      const verification: CommitVerification = {
        signed: true,
        verified: !!signerUser && row.userId === signerUser.id,
        validKeyInDb: true,
        signerUserId: signerUser?.id ?? null,
      };
      cacheSet(`${sha}:${fingerprint}`, verification);
      cacheSet(`${sha}:${keyHex}`, verification);
      return verification;
    } catch {
      continue;
    }
  }

  const fallback: CommitVerification = {
    signed: true,
    verified: false,
    validKeyInDb: false,
    signerUserId: null,
  };
  for (const keyId of signingKeyIds) {
    cacheSet(`${sha}:${keyId}`, fallback);
  }
  return fallback;
}

async function verifySha(
  ctx: VerificationContext,
  sha: string,
): Promise<CommitVerification> {
  const raw = await readRawCommit(ctx.repoPath, sha);
  if (!raw) return { ...UNSIGNED_RESULT };

  const extracted = extractSignatureFromCommit(raw);
  if (!extracted) return { ...UNSIGNED_RESULT };

  try {
    return await verifyWithKeys(ctx, sha, extracted);
  } catch (e) {
    logger.warn({ err: e, sha }, "Commit signature verification failed");
    return { ...UNSIGNED_RESULT };
  }
}

/**
 * Verify a single commit's GPG signature against user-uploaded public keys.
 * Never throws — any failure yields an "unsigned"-shaped result.
 */
export async function verifyCommitSignature(opts: {
  owner: string;
  repo: string;
  sha: string;
}): Promise<CommitVerification> {
  try {
    const ctx = await loadContext(opts.owner, opts.repo);
    if (!ctx) return { ...UNSIGNED_RESULT };
    return await verifySha(ctx, opts.sha);
  } catch (e) {
    logger.warn(
      { err: e, owner: opts.owner, repo: opts.repo, sha: opts.sha },
      "Commit signature verification failed",
    );
    return { ...UNSIGNED_RESULT };
  }
}

/**
 * Verify a page of commits sequentially (openpgp is CPU-bound).
 * Returns a Map keyed by sha. Empty map when disabled via
 * COMMIT_SIGNATURE_VERIFICATION=false.
 */
export async function verifyCommitsSignatures(
  owner: string,
  repo: string,
  shas: string[],
  maxBatch = 20,
): Promise<Map<string, CommitVerification>> {
  const results = new Map<string, CommitVerification>();
  if (process.env.COMMIT_SIGNATURE_VERIFICATION === "false") return results;

  const batch = shas.filter(Boolean).slice(0, maxBatch);
  if (batch.length === 0) return results;

  let ctx: VerificationContext | null = null;
  try {
    ctx = await loadContext(owner, repo);
  } catch (e) {
    logger.warn({ err: e, owner, repo }, "Commit signature verification context failed");
  }
  if (!ctx) {
    for (const sha of batch) results.set(sha, { ...UNSIGNED_RESULT });
    return results;
  }

  for (const sha of batch) {
    results.set(sha, await verifySha(ctx, sha));
  }
  return results;
}
