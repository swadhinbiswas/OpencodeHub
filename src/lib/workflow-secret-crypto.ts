import crypto from "node:crypto";

const ENC_PREFIX = "wsec:v1";
let ephemeralKey: Buffer | null = null;

function isProductionRuntime(): boolean {
  return import.meta.env.PROD || process.env.NODE_ENV === "production";
}

function getEncryptionKey(): Buffer {
  const raw =
    process.env.WORKFLOW_SECRET_ENCRYPTION_KEY ||
    process.env.APP_ENCRYPTION_KEY ||
    process.env.AI_CONFIG_ENCRYPTION_KEY;

  if (!raw) {
    if (isProductionRuntime()) {
      throw new Error(
        "WORKFLOW_SECRET_ENCRYPTION_KEY (or APP_ENCRYPTION_KEY) is required in production"
      );
    }

    if (!ephemeralKey) {
      ephemeralKey = crypto.randomBytes(32);
    }
    return ephemeralKey;
  }

  return crypto.createHash("sha256").update(raw).digest();
}

export function isEncryptedWorkflowSecret(value: string): boolean {
  return value.startsWith(`${ENC_PREFIX}:`);
}

export function encryptWorkflowSecret(value: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptWorkflowSecret(value: string): string {
  if (!isEncryptedWorkflowSecret(value)) {
    // Backward compatibility with legacy plain-text rows.
    return value;
  }

  const key = getEncryptionKey();
  const [, , ivB64, tagB64, dataB64] = value.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted workflow secret value");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
