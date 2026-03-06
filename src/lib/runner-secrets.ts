import crypto from "node:crypto";

const RUNNER_TOKEN_HASH_PREFIX = "sha256:v1:";
const RUNNER_TOKEN_PEPPER =
  process.env.RUNNER_TOKEN_PEPPER ||
  process.env.RUNNER_SECRET ||
  process.env.JWT_SECRET ||
  "dev-runner-token-pepper";

export function hashRunnerSecret(secret: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${RUNNER_TOKEN_PEPPER}:${secret}`)
    .digest("hex");
  return `${RUNNER_TOKEN_HASH_PREFIX}${digest}`;
}

export function verifyRunnerSecret(storedSecret: string, providedSecret: string): boolean {
  if (!storedSecret || !providedSecret) return false;

  if (storedSecret.startsWith(RUNNER_TOKEN_HASH_PREFIX)) {
    return timingSafeHexEqual(
      storedSecret.slice(RUNNER_TOKEN_HASH_PREFIX.length),
      hashRunnerSecret(providedSecret).slice(RUNNER_TOKEN_HASH_PREFIX.length)
    );
  }

  // Backward compatibility for legacy plain-text stored tokens.
  return timingSafeUtf8Equal(storedSecret, providedSecret);
}

export function isLegacyPlainSecret(storedSecret: string): boolean {
  return !!storedSecret && !storedSecret.startsWith(RUNNER_TOKEN_HASH_PREFIX);
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(aHex, "hex"), Buffer.from(bHex, "hex"));
}

function timingSafeUtf8Equal(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
