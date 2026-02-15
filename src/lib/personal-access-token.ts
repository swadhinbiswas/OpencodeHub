import crypto from "node:crypto";

const PAT_HASH_PREFIX = "pat_sha256:";

export function hashPersonalAccessToken(token: string): string {
  const digest = crypto.createHash("sha256").update(token, "utf8").digest("hex");
  return `${PAT_HASH_PREFIX}${digest}`;
}

export function isHashedPersonalAccessToken(stored: string): boolean {
  return stored.startsWith(PAT_HASH_PREFIX);
}

export function verifyPersonalAccessTokenValue(
  stored: string,
  provided: string
): boolean {
  if (isHashedPersonalAccessToken(stored)) {
    const expected = hashPersonalAccessToken(provided);
    const a = Buffer.from(stored, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // Legacy fallback: older rows stored raw PAT values.
  return stored === provided;
}

export function getTokenPrefixForDisplay(stored: string): string {
  if (stored.startsWith("och_")) {
    return `${stored.slice(0, 12)}...`;
  }
  return "och_********";
}
