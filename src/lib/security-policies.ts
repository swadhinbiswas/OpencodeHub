import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { generateId } from "./utils";

export interface ResolvedSecurityPolicy {
  enforcementMode: "warn" | "block";
  secretBlockedTypes: string[];
  secretMinSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  licenseAllowedTypes: string[];
  licenseBlockedLicenses: string[];
  isEnabled: boolean;
}

export const DEFAULT_SECURITY_POLICY: ResolvedSecurityPolicy = {
  enforcementMode: "warn",
  secretBlockedTypes: [],
  secretMinSeverity: "HIGH",
  licenseAllowedTypes: ["permissive"],
  licenseBlockedLicenses: [],
  isEnabled: true,
};

const severityRank: Record<string, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  UNKNOWN: 1,
};

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((entry): entry is string => typeof entry === "string");
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return toStringArray(JSON.parse(raw));
  } catch {
    return [];
  }
}

function parseSeverity(raw: string | null | undefined): ResolvedSecurityPolicy["secretMinSeverity"] {
  const normalized = (raw || "").toUpperCase();
  if (normalized === "CRITICAL" || normalized === "HIGH" || normalized === "MEDIUM" || normalized === "LOW" || normalized === "UNKNOWN") {
    return normalized;
  }
  return "HIGH";
}

function parseMode(raw: string | null | undefined): ResolvedSecurityPolicy["enforcementMode"] {
  return raw === "block" ? "block" : "warn";
}

export async function getRepositorySecurityPolicy(repositoryId: string): Promise<ResolvedSecurityPolicy> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const row = await db.query.securityPolicies.findFirst({
    where: eq(schema.securityPolicies.repositoryId, repositoryId),
  });

  if (!row) {
    return { ...DEFAULT_SECURITY_POLICY };
  }

  return {
    enforcementMode: parseMode(row.enforcementMode),
    secretBlockedTypes: parseJsonArray(row.secretBlockedTypes),
    secretMinSeverity: parseSeverity(row.secretMinSeverity),
    licenseAllowedTypes: parseJsonArray(row.licenseAllowedTypes),
    licenseBlockedLicenses: parseJsonArray(row.licenseBlockedLicenses),
    isEnabled: row.isEnabled,
  };
}

export async function upsertRepositorySecurityPolicy(options: {
  repositoryId: string;
  userId: string;
  enforcementMode: "warn" | "block";
  secretBlockedTypes: string[];
  secretMinSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  licenseAllowedTypes: string[];
  licenseBlockedLicenses: string[];
  isEnabled: boolean;
}): Promise<ResolvedSecurityPolicy> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const existing = await db.query.securityPolicies.findFirst({
    where: eq(schema.securityPolicies.repositoryId, options.repositoryId),
  });

  const payload = {
    enforcementMode: options.enforcementMode,
    secretBlockedTypes: JSON.stringify(options.secretBlockedTypes),
    secretMinSeverity: options.secretMinSeverity,
    licenseAllowedTypes: JSON.stringify(options.licenseAllowedTypes),
    licenseBlockedLicenses: JSON.stringify(options.licenseBlockedLicenses),
    isEnabled: options.isEnabled,
    updatedById: options.userId,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(schema.securityPolicies).set(payload).where(eq(schema.securityPolicies.id, existing.id));
  } else {
    await db.insert(schema.securityPolicies).values({
      id: generateId(),
      repositoryId: options.repositoryId,
      createdAt: new Date(),
      ...payload,
    });
  }

  return getRepositorySecurityPolicy(options.repositoryId);
}

function extractLicenseName(vulnerabilityId: string | null | undefined, title: string | null | undefined): string {
  if (vulnerabilityId?.startsWith("LICENSE-")) {
    return vulnerabilityId.slice("LICENSE-".length).trim();
  }
  if (title?.startsWith("License:")) {
    return title.replace("License:", "").trim();
  }
  return "";
}

export function evaluateSecretPolicy(
  policy: ResolvedSecurityPolicy,
  secretType: string | null | undefined,
  severity: string | null | undefined
): { violated: boolean; reason?: string } {
  if (!policy.isEnabled) return { violated: false };

  const normalizedSeverity = (severity || "UNKNOWN").toUpperCase();
  const meetsSeverity =
    (severityRank[normalizedSeverity] || 0) >= severityRank[policy.secretMinSeverity];

  const normalizedType = (secretType || "").toLowerCase();
  const normalizedBlocked = policy.secretBlockedTypes.map((t) => t.toLowerCase());
  const blockedByType = normalizedBlocked.length > 0 && normalizedBlocked.includes(normalizedType);

  if (blockedByType) {
    return { violated: true, reason: `Secret type "${secretType}" is blocked by policy` };
  }
  if (meetsSeverity) {
    return { violated: true, reason: `Secret severity ${normalizedSeverity} meets or exceeds policy threshold ${policy.secretMinSeverity}` };
  }
  return { violated: false };
}

export function evaluateLicensePolicy(
  policy: ResolvedSecurityPolicy,
  licenseType: string | null | undefined,
  vulnerabilityId: string | null | undefined,
  title: string | null | undefined
): { violated: boolean; reason?: string } {
  if (!policy.isEnabled) return { violated: false };
  const normalizedType = (licenseType || "unknown").toLowerCase();
  const allowedTypes = policy.licenseAllowedTypes.map((t) => t.toLowerCase());
  const licenseName = extractLicenseName(vulnerabilityId, title);
  const blockedLicenses = policy.licenseBlockedLicenses.map((l) => l.toLowerCase());

  if (blockedLicenses.includes(licenseName.toLowerCase())) {
    return { violated: true, reason: `License "${licenseName}" is blocked by policy` };
  }
  if (allowedTypes.length > 0 && !allowedTypes.includes(normalizedType)) {
    return { violated: true, reason: `License type "${normalizedType}" is not allowed by policy` };
  }
  return { violated: false };
}

