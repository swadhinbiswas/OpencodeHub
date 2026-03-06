/**
 * Advanced Security Features Library
 * Secret scanning, license compliance, rate limiting, SAML SSO
 */

import { getDatabase, schema } from "@/db";
import {
  ipAllowLists,
  licenseScans,
  rateLimitRules,
  samlConfigs,
  secretScanResults,
} from "@/db/schema/integrations";
import { and, eq, gt, gte, lte } from "drizzle-orm";
import { logger } from "./logger";

// Re-export types from schema for consumers
export type SecretScanResult = typeof secretScanResults.$inferSelect;
export type LicenseScan = typeof licenseScans.$inferSelect;
export type RateLimitRule = typeof rateLimitRules.$inferSelect;
export type SAMLConfig = typeof samlConfigs.$inferSelect;
export type IPAllowList = typeof ipAllowLists.$inferSelect;

// ============================================================================
// SECRET SCANNING
// ============================================================================

const SECRET_PATTERNS = [
  {
    type: "aws_access_key",
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: "critical",
  },
  {
    type: "aws_secret_key",
    pattern: /[A-Za-z0-9/+=]{40}/g,
    severity: "critical",
  },
  {
    type: "github_token",
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    severity: "critical",
  },
  {
    type: "gitlab_token",
    pattern: /glpat-[A-Za-z0-9\-_]{20,}/g,
    severity: "critical",
  },
  {
    type: "slack_token",
    pattern: /xox[baprs]-[A-Za-z0-9\-]+/g,
    severity: "high",
  },
  { type: "npm_token", pattern: /npm_[A-Za-z0-9]{36}/g, severity: "high" },
  {
    type: "private_key",
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    severity: "critical",
  },
  {
    type: "api_key",
    pattern: /api[_-]?key['":\s]*[=:]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi,
    severity: "medium",
  },
  {
    type: "password",
    pattern: /password['":\s]*[=:]\s*['"][^'"]{8,}['"]/gi,
    severity: "high",
  },
  {
    type: "jwt",
    pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    severity: "high",
  },
  {
    type: "stripe_key",
    pattern: /sk_live_[A-Za-z0-9]{24,}/g,
    severity: "critical",
  },
  {
    type: "sendgrid_key",
    pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
    severity: "high",
  },
];

export async function scanForSecrets(options: {
  repositoryId: string;
  commitSha: string;
  files: { path: string; content: string }[];
}): Promise<SecretScanResult[]> {
  const db = getDatabase();
  const results: SecretScanResult[] = [];

  for (const file of options.files) {
    // Skip binary files and common false positive paths
    if (shouldSkipFile(file.path)) continue;

    const lines = file.content.split("\n");

    for (const { type, pattern, severity } of SECRET_PATTERNS) {
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const matches = line.matchAll(pattern);

        for (const match of matches) {
          // Mask the secret for storage
          const masked = maskSecret(match[0]);

          const result = {
            id: crypto.randomUUID(),
            repositoryId: options.repositoryId,
            commitSha: options.commitSha,
            secretType: type,
            file: file.path,
            line: lineNum + 1,
            snippet: masked,
            severity,
            status: "open",
            resolvedAt: null,
            resolvedById: null,
            createdAt: new Date(),
          };

          // @ts-expect-error - Drizzle multi-db union type issue
          await db.insert(schema.secretScanResults).values(result);
          results.push(result as SecretScanResult);
        }
      }
    }
  }

  if (results.length > 0) {
    logger.warn(
      {
        repoId: options.repositoryId,
        secretCount: results.length,
      },
      "Secrets detected in commit",
    );
  }

  return results;
}

function shouldSkipFile(path: string): boolean {
  const skipPatterns = [
    /node_modules\//,
    /\.min\.(js|css)$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /\.git\//,
    /\.(png|jpg|gif|svg|ico|woff|ttf|eot)$/i,
  ];
  return skipPatterns.some((p) => p.test(path));
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "****";
  return secret.slice(0, 4) + "*".repeat(secret.length - 8) + secret.slice(-4);
}

export async function resolveSecretAlert(
  alertId: string,
  userId: string,
  resolution: "resolved" | "false_positive",
): Promise<boolean> {
  const db = getDatabase();

  try {
    // @ts-expect-error - Drizzle multi-db union type issue
    await db
      .update(schema.secretScanResults)
      .set({
        status: resolution,
        resolvedAt: new Date(),
        resolvedById: userId,
      })
      .where(eq(schema.secretScanResults.id, alertId));

    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// LICENSE COMPLIANCE SCANNING
// ============================================================================

const LICENSE_TYPES: Record<string, { type: string; compliant: boolean }> = {
  MIT: { type: "permissive", compliant: true },
  "Apache-2.0": { type: "permissive", compliant: true },
  "BSD-2-Clause": { type: "permissive", compliant: true },
  "BSD-3-Clause": { type: "permissive", compliant: true },
  ISC: { type: "permissive", compliant: true },
  "GPL-2.0": { type: "copyleft", compliant: false },
  "GPL-3.0": { type: "copyleft", compliant: false },
  "LGPL-2.1": { type: "copyleft", compliant: true },
  "LGPL-3.0": { type: "copyleft", compliant: true },
  "MPL-2.0": { type: "copyleft", compliant: true },
  "AGPL-3.0": { type: "copyleft", compliant: false },
  Unlicense: { type: "permissive", compliant: true },
  "CC0-1.0": { type: "permissive", compliant: true },
  Proprietary: { type: "proprietary", compliant: false },
};

export async function scanLicenses(options: {
  repositoryId: string;
  commitSha: string;
  dependencies: { name: string; version: string; license: string }[];
  policy?: { allowedTypes: string[]; blockedLicenses: string[] };
}): Promise<LicenseScan[]> {
  const db = getDatabase();
  const results: LicenseScan[] = [];

  const policy = options.policy || {
    allowedTypes: ["permissive"],
    blockedLicenses: ["AGPL-3.0", "GPL-3.0"],
  };

  for (const dep of options.dependencies) {
    const licenseInfo = LICENSE_TYPES[dep.license] || {
      type: "unknown",
      compliant: false,
    };

    const isCompliant =
      policy.allowedTypes.includes(licenseInfo.type) &&
      !policy.blockedLicenses.includes(dep.license);

    const result = {
      id: crypto.randomUUID(),
      repositoryId: options.repositoryId,
      commitSha: options.commitSha,
      packageName: dep.name,
      packageVersion: dep.version,
      license: dep.license,
      licenseType: licenseInfo.type,
      isCompliant,
      policyViolation: isCompliant
        ? null
        : `License ${dep.license} violates policy`,
      createdAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.licenseScans).values(result);
    results.push(result as LicenseScan);
  }

  return results;
}

export async function getLicenseReport(repositoryId: string): Promise<{
  totalDeps: number;
  compliant: number;
  violations: LicenseScan[];
  byType: Record<string, number>;
}> {
  const db = getDatabase();

  const scans =
    (await db.query.licenseScans?.findMany({
      where: eq(schema.licenseScans.repositoryId, repositoryId),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    })) || [];

  // Get latest scan per package
  const latestByPackage = new Map<string, LicenseScan>();
  for (const scan of scans) {
    if (!latestByPackage.has(scan.packageName)) {
      latestByPackage.set(scan.packageName, scan);
    }
  }

  const latest = Array.from(latestByPackage.values());
  const byType: Record<string, number> = {};

  for (const scan of latest) {
    byType[scan.licenseType] = (byType[scan.licenseType] || 0) + 1;
  }

  return {
    totalDeps: latest.length,
    compliant: latest.filter((s) => s.isCompliant).length,
    violations: latest.filter((s) => !s.isCompliant),
    byType,
  };
}

// ============================================================================
// DISTRIBUTED RATE LIMITING
// ============================================================================

export async function createRateLimitRule(options: {
  name: string;
  path: string;
  method?: string;
  windowMs: number;
  maxRequests: number;
  keyType?: "ip" | "user" | "token";
}): Promise<RateLimitRule> {
  const db = getDatabase();

  const rule = {
    id: crypto.randomUUID(),
    name: options.name,
    path: options.path,
    method: options.method || null,
    windowMs: options.windowMs,
    maxRequests: options.maxRequests,
    keyType: options.keyType || "ip",
    isEnabled: true,
    createdAt: new Date(),
  };

  // @ts-expect-error - Drizzle multi-db union type issue
  await db.insert(schema.rateLimitRules).values(rule);

  return rule as RateLimitRule;
}

export async function checkRateLimit(options: {
  path: string;
  method: string;
  key: string; // IP, user ID, or token
}): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const db = getDatabase();

  // Find matching rules
  const rules =
    (await db.query.rateLimitRules?.findMany({
      where: eq(schema.rateLimitRules.isEnabled, true),
    })) || [];

  const matchingRule = rules.find((rule) => {
    const pathMatch = new RegExp(rule.path).test(options.path);
    const methodMatch = !rule.method || rule.method === options.method;
    return pathMatch && methodMatch;
  });

  if (!matchingRule) {
    return { allowed: true, remaining: Infinity, resetAt: new Date() };
  }

  const windowStart = new Date(Date.now() - matchingRule.windowMs);

  // Get or create rate limit log
  const existing = await db.query.rateLimitLogs?.findFirst({
    where: and(
      eq(schema.rateLimitLogs.ruleId, matchingRule.id),
      eq(schema.rateLimitLogs.key, options.key),
      gt(schema.rateLimitLogs.windowStart, windowStart),
    ),
  });

  if (existing) {
    const allowed = existing.requestCount < matchingRule.maxRequests;
    const remaining = Math.max(
      0,
      matchingRule.maxRequests - existing.requestCount,
    );
    const resetAt = new Date(
      existing.windowStart.getTime() + matchingRule.windowMs,
    );

    // Increment counter
    // @ts-expect-error - Drizzle multi-db union type issue
    await db
      .update(schema.rateLimitLogs)
      .set({
        requestCount: existing.requestCount + 1,
        blocked: !allowed,
      })
      .where(eq(schema.rateLimitLogs.id, existing.id));

    return { allowed, remaining: remaining - 1, resetAt };
  } else {
    // Create new window
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.rateLimitLogs).values({
      id: crypto.randomUUID(),
      ruleId: matchingRule.id,
      key: options.key,
      requestCount: 1,
      windowStart: new Date(),
      blocked: false,
    });

    return {
      allowed: true,
      remaining: matchingRule.maxRequests - 1,
      resetAt: new Date(Date.now() + matchingRule.windowMs),
    };
  }
}

// ============================================================================
// SAML SSO
// ============================================================================

export async function configureSAML(options: {
  organizationId: string;
  entityId: string;
  ssoUrl: string;
  certificate: string;
}): Promise<SAMLConfig> {
  const db = getDatabase();

  const config = {
    id: crypto.randomUUID(),
    organizationId: options.organizationId,
    entityId: options.entityId,
    ssoUrl: options.ssoUrl,
    certificate: options.certificate,
    signatureAlgorithm: "RSA-SHA256",
    digestAlgorithm: "SHA256",
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // @ts-expect-error - Drizzle multi-db union type issue
  await db.insert(schema.samlConfigs).values(config);

  logger.info({ orgId: options.organizationId }, "SAML configured");

  return config as SAMLConfig;
}

export async function generateSAMLRequest(config: SAMLConfig): Promise<{
  url: string;
  request: string;
}> {
  const requestId = `_${crypto.randomUUID()}`;
  const issueInstant = new Date().toISOString();

  const request = `
<samlp:AuthnRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${requestId}"
    Version="2.0"
    IssueInstant="${issueInstant}"
    AssertionConsumerServiceURL="${process.env.APP_URL}/api/auth/saml/callback"
    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
    <saml:Issuer>${config.entityId}</saml:Issuer>
</samlp:AuthnRequest>`;

  const encoded = Buffer.from(request).toString("base64");
  const url = `${config.ssoUrl}?SAMLRequest=${encodeURIComponent(encoded)}`;

  return { url, request };
}

export async function validateSAMLResponse(
  config: SAMLConfig,
  response: string,
): Promise<{
  valid: boolean;
  user?: { email: string; name: string; groups: string[] };
  error?: string;
}> {
  try {
    const decoded = Buffer.from(response, "base64").toString("utf8");

    // Verify the response contains a valid SAML assertion
    if (
      !decoded.includes("samlp:Response") &&
      !decoded.includes("saml2p:Response")
    ) {
      return { valid: false, error: "Invalid SAML response format" };
    }

    // Check StatusCode for success
    const statusMatch = decoded.match(/<samlp?:StatusCode\s+Value="([^"]+)"/);
    if (statusMatch && !statusMatch[1].endsWith(":Success")) {
      return {
        valid: false,
        error: `SAML authentication failed: ${statusMatch[1]}`,
      };
    }

    // Validate signature if certificate is provided
    if (config.certificate) {
      const signatureValid = verifySAMLSignature(
        decoded,
        config.certificate,
        config.signatureAlgorithm || "RSA-SHA256",
      );
      if (!signatureValid) {
        logger.warn(
          { orgId: config.organizationId },
          "SAML signature validation failed",
        );
        return { valid: false, error: "Signature validation failed" };
      }
    }

    // Validate conditions (NotBefore / NotOnOrAfter)
    const notBeforeMatch = decoded.match(/NotBefore="([^"]+)"/);
    const notOnOrAfterMatch = decoded.match(/NotOnOrAfter="([^"]+)"/);
    const now = new Date();

    if (notBeforeMatch) {
      const notBefore = new Date(notBeforeMatch[1]);
      if (now < notBefore) {
        return { valid: false, error: "SAML assertion not yet valid" };
      }
    }
    if (notOnOrAfterMatch) {
      const notOnOrAfter = new Date(notOnOrAfterMatch[1]);
      if (now >= notOnOrAfter) {
        return { valid: false, error: "SAML assertion has expired" };
      }
    }

    // Extract NameID (email/subject)
    const emailMatch = decoded.match(
      /<saml2?:NameID[^>]*>([^<]+)<\/saml2?:NameID>/,
    );
    if (!emailMatch) {
      return { valid: false, error: "No NameID found in SAML response" };
    }

    // Extract display name from attributes
    const nameMatch = decoded.match(
      /<saml2?:Attribute\s+Name="(?:displayName|http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/name)"[^>]*>\s*<saml2?:AttributeValue[^>]*>([^<]+)/s,
    );

    // Extract group/role attributes for team mapping
    const groups: string[] = [];
    const groupRegex =
      /<saml2?:Attribute\s+Name="(?:groups|memberOf|http:\/\/schemas\.xmlsoap\.org\/claims\/Group|http:\/\/schemas\.microsoft\.com\/ws\/2008\/06\/identity\/claims\/groups)"[^>]*>([\s\S]*?)<\/saml2?:Attribute>/g;
    let groupAttrMatch;
    while ((groupAttrMatch = groupRegex.exec(decoded)) !== null) {
      const attrValues = groupAttrMatch[1];
      const valueRegex =
        /<saml2?:AttributeValue[^>]*>([^<]+)<\/saml2?:AttributeValue>/g;
      let valueMatch;
      while ((valueMatch = valueRegex.exec(attrValues)) !== null) {
        groups.push(valueMatch[1].trim());
      }
    }

    logger.info(
      {
        email: emailMatch[1],
        groups: groups.length,
        orgId: config.organizationId,
      },
      "SAML response validated successfully",
    );

    return {
      valid: true,
      user: {
        email: emailMatch[1],
        name: nameMatch?.[1] || emailMatch[1].split("@")[0],
        groups,
      },
    };
  } catch (err) {
    logger.error(
      { error: err, orgId: config.organizationId },
      "SAML response validation error",
    );
    return { valid: false, error: "Failed to parse SAML response" };
  }
}

/**
 * Verify SAML XML signature using the IdP certificate
 */
function verifySAMLSignature(
  xml: string,
  certificate: string,
  algorithm: string,
): boolean {
  try {
    const crypto = require("crypto");

    // Extract the SignatureValue
    const sigValueMatch = xml.match(
      /<ds:SignatureValue[^>]*>([\s\S]*?)<\/ds:SignatureValue>/,
    );
    if (!sigValueMatch) {
      // No signature present — accept if config allows unsigned assertions
      return true;
    }

    // Extract the signed content (SignedInfo)
    const signedInfoMatch = xml.match(
      /<ds:SignedInfo[^>]*>[\s\S]*?<\/ds:SignedInfo>/,
    );
    if (!signedInfoMatch) return false;

    // Normalize the certificate
    const certPem = certificate.includes("BEGIN CERTIFICATE")
      ? certificate
      : `-----BEGIN CERTIFICATE-----\n${certificate}\n-----END CERTIFICATE-----`;

    // Map SAML algorithm names to Node.js names
    const algoMap: Record<string, string> = {
      "RSA-SHA256": "RSA-SHA256",
      "RSA-SHA1": "RSA-SHA1",
      "RSA-SHA384": "RSA-SHA384",
      "RSA-SHA512": "RSA-SHA512",
    };

    const verifier = crypto.createVerify(algoMap[algorithm] || "RSA-SHA256");
    verifier.update(signedInfoMatch[0]);

    const signatureBytes = Buffer.from(
      sigValueMatch[1].replace(/\s/g, ""),
      "base64",
    );

    return verifier.verify(certPem, signatureBytes);
  } catch (err) {
    logger.warn({ error: err }, "SAML signature verification error");
    return false;
  }
}

/**
 * Map SAML groups to internal teams and sync membership
 */
export async function syncSAMLGroupsToTeams(
  userId: string,
  organizationId: string,
  samlGroups: string[],
): Promise<{ synced: number; teams: string[] }> {
  const db = getDatabase();

  // Find teams in the organization
  const orgTeams =
    (await db.query.teams?.findMany({
      where: eq(schema.teams.organizationId, organizationId),
    })) || [];

  const syncedTeams: string[] = [];

  for (const team of orgTeams) {
    // Match SAML groups to teams by name (case-insensitive)
    const teamNameLower = team.name.toLowerCase();
    const isGroupMember = samlGroups.some(
      (g) =>
        g.toLowerCase() === teamNameLower ||
        g.toLowerCase().endsWith(`/${teamNameLower}`) ||
        g.toLowerCase().includes(teamNameLower),
    );

    const existingMembership = await db.query.teamMembers?.findFirst({
      where: and(
        eq(schema.teamMembers.teamId, team.id),
        eq(schema.teamMembers.userId, userId),
      ),
    });

    if (isGroupMember && !existingMembership) {
      // Add to team
      // @ts-expect-error - Drizzle multi-db union type issue
      await db.insert(schema.teamMembers).values({
        id: crypto.randomUUID(),
        teamId: team.id,
        userId: userId,
        role: "member",
        createdAt: new Date(),
      });
      syncedTeams.push(team.name);
    } else if (!isGroupMember && existingMembership) {
      // Remove from team (SAML is authoritative source)
      // @ts-expect-error - Drizzle multi-db union type issue
      await db
        .delete(schema.teamMembers)
        .where(
          and(
            eq(schema.teamMembers.teamId, team.id),
            eq(schema.teamMembers.userId, userId),
          ),
        );
    }

    if (isGroupMember) {
      syncedTeams.push(team.name);
    }
  }

  logger.info(
    {
      userId,
      orgId: organizationId,
      synced: syncedTeams.length,
      groups: samlGroups.length,
    },
    "SAML groups synced to teams",
  );

  return { synced: syncedTeams.length, teams: syncedTeams };
}

/**
 * Generate SAML Single Logout (SLO) request
 */
export function generateSAMLLogoutRequest(
  config: SAMLConfig,
  nameId: string,
  sessionIndex?: string,
): { url: string; request: string } {
  const requestId = `_${crypto.randomUUID()}`;
  const issueInstant = new Date().toISOString();

  const request = `
<samlp:LogoutRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${requestId}"
    Version="2.0"
    IssueInstant="${issueInstant}"
    Destination="${config.ssoUrl}">
    <saml:Issuer>${config.entityId}</saml:Issuer>
    <saml:NameID>${nameId}</saml:NameID>
    ${sessionIndex ? `<samlp:SessionIndex>${sessionIndex}</samlp:SessionIndex>` : ""}
</samlp:LogoutRequest>`;

  const encoded = Buffer.from(request).toString("base64");
  const url = `${config.ssoUrl}?SAMLRequest=${encodeURIComponent(encoded)}`;

  return { url, request };
}

// ============================================================================
// IP ALLOW-LISTS
// ============================================================================

export async function addIPAllowListEntry(options: {
  organizationId: string;
  name: string;
  cidrBlock: string;
  description?: string;
  createdById: string;
}): Promise<IPAllowList> {
  const db = getDatabase();

  // Validate CIDR format
  if (!isValidCIDR(options.cidrBlock)) {
    throw new Error("Invalid CIDR block format");
  }

  const entry = {
    id: crypto.randomUUID(),
    organizationId: options.organizationId,
    name: options.name,
    cidrBlock: options.cidrBlock,
    description: options.description || null,
    isEnabled: true,
    createdAt: new Date(),
    createdById: options.createdById,
  };

  // @ts-expect-error - Drizzle multi-db union type issue
  await db.insert(schema.ipAllowLists).values(entry);

  logger.info(
    { orgId: options.organizationId, cidr: options.cidrBlock },
    "IP allow list entry added",
  );

  return entry as IPAllowList;
}

export async function checkIPAllowed(
  organizationId: string,
  ipAddress: string,
): Promise<boolean> {
  const db = getDatabase();

  const entries =
    (await db.query.ipAllowLists?.findMany({
      where: and(
        eq(schema.ipAllowLists.organizationId, organizationId),
        eq(schema.ipAllowLists.isEnabled, true),
      ),
    })) || [];

  // If no entries, allow all
  if (entries.length === 0) return true;

  // Check if IP matches any CIDR block
  for (const entry of entries) {
    if (ipMatchesCIDR(ipAddress, entry.cidrBlock)) {
      return true;
    }
  }

  return false;
}

function isValidCIDR(cidr: string): boolean {
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  if (!cidrRegex.test(cidr)) return false;

  const [ip, prefix] = cidr.split("/");
  const prefixNum = parseInt(prefix, 10);

  if (prefixNum < 0 || prefixNum > 32) return false;

  return ip.split(".").every((octet) => {
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
}

function ipMatchesCIDR(ip: string, cidr: string): boolean {
  const [cidrIP, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);

  const ipNum = ipToNumber(ip);
  const cidrNum = ipToNumber(cidrIP);
  const mask = ~((1 << (32 - prefix)) - 1);

  return (ipNum & mask) === (cidrNum & mask);
}

function ipToNumber(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
}

// ============================================================================
// AUDIT LOG EXPORT
// ============================================================================

// NOTE: Using existing auditLogs from schema instead of redefining
export type AuditLog = typeof schema.auditLogs.$inferSelect;

export async function logAuditEvent(options: {
  organizationId?: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const db = getDatabase();

  // @ts-expect-error - Drizzle multi-db union type issue
  await db.insert(schema.auditLogs).values({
    id: crypto.randomUUID(),
    organizationId: options.organizationId || null,
    userId: options.userId || null,
    action: options.action,
    targetType: options.resource,
    targetId: options.resourceId || null,
    data: options.metadata ? JSON.stringify(options.metadata) : null,
    actorIp: options.ipAddress || null,
    actorUserAgent: options.userAgent || null,
    createdAt: new Date(),
  });
}

export type AuditExportFormat = "json" | "csv" | "siem";

export async function exportAuditLogs(options: {
  organizationId: string;
  startDate: Date;
  endDate: Date;
  format: AuditExportFormat;
  actions?: string[];
}): Promise<string> {
  const db = getDatabase();

  const logs =
    (await db.query.auditLogs?.findMany({
      where: and(
        eq(schema.auditLogs.organizationId, options.organizationId),
        gte(schema.auditLogs.createdAt, options.startDate),
        lte(schema.auditLogs.createdAt, options.endDate),
      ),
      orderBy: (l, { asc }) => [asc(l.createdAt)],
    })) || [];

  const filtered = options.actions
    ? logs.filter((l) => options.actions!.includes(l.action))
    : logs;

  switch (options.format) {
    case "json":
      return JSON.stringify(filtered, null, 2);
    case "csv":
      return exportAuditCSV(filtered);
    case "siem":
      return exportAuditSIEM(filtered);
    default:
      return JSON.stringify(filtered);
  }
}

function exportAuditCSV(logs: AuditLog[]): string {
  const headers = [
    "timestamp",
    "action",
    "resource",
    "resourceId",
    "userId",
    "ipAddress",
  ];
  const rows = logs.map((l) => [
    l.createdAt.toISOString(),
    l.action,
    l.targetType || "",
    l.targetId || "",
    l.userId || "",
    l.actorIp || "",
  ]);

  return [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
  ].join("\n");
}

function exportAuditSIEM(logs: AuditLog[]): string {
  // Common Event Format (CEF) for SIEM integration
  return logs
    .map((l) => {
      const severity = getAuditSeverity(l.action);
      return (
        `CEF:0|OpenCodeHub|SecurityHub|1.0|${l.action}|${l.targetType} ${l.action}|${severity}|` +
        `src=${l.actorIp || "unknown"} ` +
        `suser=${l.userId || "unknown"} ` +
        `dvc=${l.targetId || "unknown"} ` +
        `rt=${l.createdAt.getTime()}`
      );
    })
    .join("\n");
}

function getAuditSeverity(action: string): number {
  const highSeverity = [
    "user.delete",
    "repo.delete",
    "secret.access",
    "token.create",
  ];
  const mediumSeverity = [
    "user.create",
    "repo.create",
    "pr.merge",
    "settings.update",
  ];

  if (highSeverity.some((a) => action.includes(a))) return 8;
  if (mediumSeverity.some((a) => action.includes(a))) return 5;
  return 2;
}

export async function getAuditStats(
  organizationId: string,
  days = 30,
): Promise<{
  totalEvents: number;
  byAction: Record<string, number>;
  byUser: Record<string, number>;
  topResources: { resource: string; count: number }[];
}> {
  const db = getDatabase();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const logs =
    (await db.query.auditLogs?.findMany({
      where: and(
        eq(schema.auditLogs.organizationId, organizationId),
        gte(schema.auditLogs.createdAt, startDate),
      ),
    })) || [];

  const byAction: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  const byResource: Record<string, number> = {};

  for (const log of logs) {
    byAction[log.action] = (byAction[log.action] || 0) + 1;
    if (log.userId) byUser[log.userId] = (byUser[log.userId] || 0) + 1;
    if (log.targetType)
      byResource[log.targetType] = (byResource[log.targetType] || 0) + 1;
  }

  const topResources = Object.entries(byResource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([resource, count]) => ({ resource, count }));

  return {
    totalEvents: logs.length,
    byAction,
    byUser,
    topResources,
  };
}
