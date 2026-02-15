import crypto from "node:crypto";

type AIKeys = {
  openai?: string;
  groq?: string;
  bytez?: string;
};

export interface AIConfig {
  provider: string;
  model: string;
  apiKeys: AIKeys;
}

export interface PublicAIConfig {
  provider: string;
  model: string;
  apiKeys: {
    openai: { isSet: boolean; masked?: string };
    groq: { isSet: boolean; masked?: string };
    bytez: { isSet: boolean; masked?: string };
  };
}

const DEFAULT_AI_CONFIG: AIConfig = {
  provider: "openai",
  model: "gpt-4-turbo",
  apiKeys: {},
};

const ENC_PREFIX = "enc:v1";
let ephemeralKey: Buffer | null = null;

function isProductionRuntime(): boolean {
  return import.meta.env.PROD || process.env.NODE_ENV === "production";
}

function getEncryptionKey(): Buffer {
  const raw =
    process.env.AI_CONFIG_ENCRYPTION_KEY || process.env.APP_ENCRYPTION_KEY;

  if (!raw) {
    if (isProductionRuntime()) {
      throw new Error(
        "AI_CONFIG_ENCRYPTION_KEY (or APP_ENCRYPTION_KEY) is required in production"
      );
    }

    if (!ephemeralKey) {
      ephemeralKey = crypto.randomBytes(32);
    }
    return ephemeralKey;
  }

  // Derive stable 32-byte key from configured secret.
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptValue(value: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}:${iv.toString("base64")}:${tag.toString(
    "base64"
  )}:${encrypted.toString("base64")}`;
}

function decryptValue(value: string): string {
  if (!value.startsWith(`${ENC_PREFIX}:`)) {
    // Backward compatibility with legacy plain-text rows.
    return value;
  }

  const key = getEncryptionKey();
  const [, , ivB64, tagB64, dataB64] = value.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted AI config value");
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

export function parseAIConfigFromStorage(raw: string | null | undefined): AIConfig {
  if (!raw) return { ...DEFAULT_AI_CONFIG };

  try {
    const parsed = JSON.parse(raw) as Partial<AIConfig> & {
      apiKeys?: Record<string, string | undefined>;
    };

    const decryptedApiKeys: AIKeys = {};
    for (const provider of ["openai", "groq", "bytez"] as const) {
      const value = parsed.apiKeys?.[provider];
      if (value) {
        decryptedApiKeys[provider] = decryptValue(value);
      }
    }

    return {
      provider: parsed.provider || DEFAULT_AI_CONFIG.provider,
      model: parsed.model || DEFAULT_AI_CONFIG.model,
      apiKeys: decryptedApiKeys,
    };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

export function buildStoredAIConfig(config: AIConfig): string {
  const encryptedApiKeys: AIKeys = {};
  for (const provider of ["openai", "groq", "bytez"] as const) {
    const value = config.apiKeys?.[provider];
    if (value) {
      encryptedApiKeys[provider] = encryptValue(value);
    }
  }

  return JSON.stringify({
    provider: config.provider,
    model: config.model,
    apiKeys: encryptedApiKeys,
  });
}

function mask(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.length < 4) return "****";
  return `••••${value.slice(-4)}`;
}

export function sanitizeAIConfigForClient(config: AIConfig): PublicAIConfig {
  return {
    provider: config.provider,
    model: config.model,
    apiKeys: {
      openai: {
        isSet: Boolean(config.apiKeys.openai),
        masked: mask(config.apiKeys.openai),
      },
      groq: {
        isSet: Boolean(config.apiKeys.groq),
        masked: mask(config.apiKeys.groq),
      },
      bytez: {
        isSet: Boolean(config.apiKeys.bytez),
        masked: mask(config.apiKeys.bytez),
      },
    },
  };
}

export function mergeAIConfig(
  existing: AIConfig,
  updates: { provider?: string; model?: string; apiKeys?: Partial<AIKeys> }
): AIConfig {
  return {
    provider: updates.provider || existing.provider,
    model: updates.model || existing.model,
    apiKeys: {
      openai: updates.apiKeys?.openai ?? existing.apiKeys.openai,
      groq: updates.apiKeys?.groq ?? existing.apiKeys.groq,
      bytez: updates.apiKeys?.bytez ?? existing.apiKeys.bytez,
    },
  };
}

