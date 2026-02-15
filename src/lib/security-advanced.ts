/**
 * Advanced Security Features Library
 * Secret scanning, license compliance, rate limiting, SAML SSO
 */

import { pgTable, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and, gt, desc, gte, lte } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";
import { users } from "@/db/schema/users";

// ============================================================================
// SCHEMA
// ============================================================================

export const secretScanResults = pgTable("secret_scan_results", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    secretType: text("secret_type").notNull(), // aws_key, github_token, private_key, etc.
    file: text("file").notNull(),
    line: integer("line"),
    snippet: text("snippet"), // Masked snippet
    severity: text("severity").notNull(), // critical, high, medium, low
    status: text("status").default("open"), // open, resolved, false_positive
    resolvedAt: timestamp("resolved_at"),
    resolvedById: text("resolved_by_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const licenseScans = pgTable("license_scans", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    packageName: text("package_name").notNull(),
    packageVersion: text("package_version"),
    license: text("license").notNull(),
    licenseType: text("license_type").notNull(), // permissive, copyleft, proprietary, unknown
    isCompliant: boolean("is_compliant").notNull(),
    policyViolation: text("policy_violation"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rateLimitRules = pgTable("rate_limit_rules", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    path: text("path").notNull(), // API path pattern
    method: text("method"), // GET, POST, etc. or null for all
    windowMs: integer("window_ms").notNull(), // Time window in milliseconds
    maxRequests: integer("max_requests").notNull(),
    keyType: text("key_type").default("ip"), // ip, user, token
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rateLimitLogs = pgTable("rate_limit_logs", {
    id: text("id").primaryKey(),
    ruleId: text("rule_id")
        .notNull()
        .references(() => rateLimitRules.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // IP, user ID, or token
    requestCount: integer("request_count").notNull(),
    windowStart: timestamp("window_start").notNull(),
    blocked: boolean("blocked").default(false),
});

export const samlConfigs = pgTable("saml_configs", {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    entityId: text("entity_id").notNull(),
    ssoUrl: text("sso_url").notNull(),
    certificate: text("certificate").notNull(),
    signatureAlgorithm: text("signature_algorithm").default("RSA-SHA256"),
    digestAlgorithm: text("digest_algorithm").default("SHA256"),
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SecretScanResult = typeof secretScanResults.$inferSelect;
export type LicenseScan = typeof licenseScans.$inferSelect;
export type RateLimitRule = typeof rateLimitRules.$inferSelect;
export type SAMLConfig = typeof samlConfigs.$inferSelect;

// ============================================================================
// SECRET SCANNING
// ============================================================================

const SECRET_PATTERNS = [
    { type: "aws_access_key", pattern: /AKIA[0-9A-Z]{16}/g, severity: "critical" },
    { type: "aws_secret_key", pattern: /[A-Za-z0-9/+=]{40}/g, severity: "critical" },
    { type: "github_token", pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g, severity: "critical" },
    { type: "gitlab_token", pattern: /glpat-[A-Za-z0-9\-_]{20,}/g, severity: "critical" },
    { type: "slack_token", pattern: /xox[baprs]-[A-Za-z0-9\-]+/g, severity: "high" },
    { type: "npm_token", pattern: /npm_[A-Za-z0-9]{36}/g, severity: "high" },
    { type: "private_key", pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: "critical" },
    { type: "api_key", pattern: /api[_-]?key['":\s]*[=:]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi, severity: "medium" },
    { type: "password", pattern: /password['":\s]*[=:]\s*['"][^'"]{8,}['"]/gi, severity: "high" },
    { type: "jwt", pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g, severity: "high" },
    { type: "stripe_key", pattern: /sk_live_[A-Za-z0-9]{24,}/g, severity: "critical" },
    { type: "sendgrid_key", pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, severity: "high" },
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
        logger.warn({
            repoId: options.repositoryId,
            secretCount: results.length,
        }, "Secrets detected in commit");
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
    return skipPatterns.some(p => p.test(path));
}

function maskSecret(secret: string): string {
    if (secret.length <= 8) return "****";
    return secret.slice(0, 4) + "*".repeat(secret.length - 8) + secret.slice(-4);
}

export async function resolveSecretAlert(
    alertId: string,
    userId: string,
    resolution: "resolved" | "false_positive"
): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.secretScanResults)
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
        const licenseInfo = LICENSE_TYPES[dep.license] || { type: "unknown", compliant: false };

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
            policyViolation: isCompliant ? null : `License ${dep.license} violates policy`,
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

    const scans = await db.query.licenseScans?.findMany({
        where: eq(schema.licenseScans.repositoryId, repositoryId),
        orderBy: (s, { desc }) => [desc(s.createdAt)],
    }) || [];

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
        compliant: latest.filter(s => s.isCompliant).length,
        violations: latest.filter(s => !s.isCompliant),
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
    const rules = await db.query.rateLimitRules?.findMany({
        where: eq(schema.rateLimitRules.isEnabled, true),
    }) || [];

    const matchingRule = rules.find(rule => {
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
            gt(schema.rateLimitLogs.windowStart, windowStart)
        ),
    });

    if (existing) {
        const allowed = existing.requestCount < matchingRule.maxRequests;
        const remaining = Math.max(0, matchingRule.maxRequests - existing.requestCount);
        const resetAt = new Date(existing.windowStart.getTime() + matchingRule.windowMs);

        // Increment counter
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.rateLimitLogs)
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
    response: string
): Promise<{ valid: boolean; user?: { email: string; name: string } }> {
    try {
        const decoded = Buffer.from(response, "base64").toString("utf8");

        // In production, use proper XML parsing and signature validation
        const emailMatch = decoded.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
        const nameMatch = decoded.match(/<saml:Attribute Name="displayName"[^>]*>.*?<saml:AttributeValue>([^<]+)/s);

        if (emailMatch) {
            return {
                valid: true,
                user: {
                    email: emailMatch[1],
                    name: nameMatch?.[1] || emailMatch[1].split("@")[0],
                },
            };
        }

        return { valid: false };
    } catch {
        return { valid: false };
    }
}

// ============================================================================
// IP ALLOW-LISTS
// ============================================================================

export const ipAllowLists = pgTable("ip_allow_lists", {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    cidrBlock: text("cidr_block").notNull(), // e.g., "192.168.1.0/24"
    description: text("description"),
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    createdById: text("created_by_id").notNull(),
});

export type IPAllowList = typeof ipAllowLists.$inferSelect;

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

    logger.info({ orgId: options.organizationId, cidr: options.cidrBlock }, "IP allow list entry added");

    return entry as IPAllowList;
}

export async function checkIPAllowed(organizationId: string, ipAddress: string): Promise<boolean> {
    const db = getDatabase();

    const entries = await db.query.ipAllowLists?.findMany({
        where: and(
            eq(schema.ipAllowLists.organizationId, organizationId),
            eq(schema.ipAllowLists.isEnabled, true)
        ),
    }) || [];

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

    return ip.split(".").every(octet => {
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
    return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
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

    const logs = await db.query.auditLogs?.findMany({
        where: and(
            eq(schema.auditLogs.organizationId, options.organizationId),
            gte(schema.auditLogs.createdAt, options.startDate),
            lte(schema.auditLogs.createdAt, options.endDate)
        ),
        orderBy: (l, { asc }) => [asc(l.createdAt)],
    }) || [];

    const filtered = options.actions
        ? logs.filter(l => options.actions!.includes(l.action))
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
    const headers = ["timestamp", "action", "resource", "resourceId", "userId", "ipAddress"];
    const rows = logs.map(l => [
        l.createdAt.toISOString(),
        l.action,
        l.targetType || "",
        l.targetId || "",
        l.userId || "",
        l.actorIp || "",
    ]);

    return [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
}

function exportAuditSIEM(logs: AuditLog[]): string {
    // Common Event Format (CEF) for SIEM integration
    return logs.map(l => {
        const severity = getAuditSeverity(l.action);
        return `CEF:0|OpenCodeHub|SecurityHub|1.0|${l.action}|${l.targetType} ${l.action}|${severity}|` +
            `src=${l.actorIp || "unknown"} ` +
            `suser=${l.userId || "unknown"} ` +
            `dvc=${l.targetId || "unknown"} ` +
            `rt=${l.createdAt.getTime()}`;
    }).join("\n");
}

function getAuditSeverity(action: string): number {
    const highSeverity = ["user.delete", "repo.delete", "secret.access", "token.create"];
    const mediumSeverity = ["user.create", "repo.create", "pr.merge", "settings.update"];

    if (highSeverity.some(a => action.includes(a))) return 8;
    if (mediumSeverity.some(a => action.includes(a))) return 5;
    return 2;
}

export async function getAuditStats(organizationId: string, days = 30): Promise<{
    totalEvents: number;
    byAction: Record<string, number>;
    byUser: Record<string, number>;
    topResources: { resource: string; count: number }[];
}> {
    const db = getDatabase();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await db.query.auditLogs?.findMany({
        where: and(
            eq(schema.auditLogs.organizationId, organizationId),
            gte(schema.auditLogs.createdAt, startDate)
        ),
    }) || [];

    const byAction: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    const byResource: Record<string, number> = {};

    for (const log of logs) {
        byAction[log.action] = (byAction[log.action] || 0) + 1;
        if (log.userId) byUser[log.userId] = (byUser[log.userId] || 0) + 1;
        if (log.targetType) byResource[log.targetType] = (byResource[log.targetType] || 0) + 1;
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
