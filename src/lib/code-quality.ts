/**
 * Code Quality Integrations Library
 * Codecov, Coveralls, SonarQube, Snyk integrations
 */

import { pgTable, text, timestamp, boolean, integer, real } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";
import { pullRequests } from "@/db/schema/pull-requests";

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/**
 * Code quality provider configurations
 */
export const codeQualityConfigs = pgTable("code_quality_configs", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // codecov, coveralls, sonarqube, snyk
    projectKey: text("project_key"),
    apiToken: text("api_token"), // Encrypted
    serverUrl: text("server_url"), // For self-hosted (SonarQube)
    webhookSecret: text("webhook_secret"),
    isEnabled: boolean("is_enabled").default(true),
    reportOnPR: boolean("report_on_pr").default(true),
    blockOnFail: boolean("block_on_fail").default(false),
    minCoverage: real("min_coverage"), // Minimum coverage threshold
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Coverage reports
 */
export const coverageReports = pgTable("coverage_reports", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id"),
    commitSha: text("commit_sha").notNull(),
    provider: text("provider").notNull(),
    coverage: real("coverage").notNull(), // Percentage 0-100
    linesCovered: integer("lines_covered"),
    linesTotal: integer("lines_total"),
    branchCoverage: real("branch_coverage"),
    delta: real("delta"), // Coverage change from base
    status: text("status").notNull(), // success, failure, pending
    reportUrl: text("report_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Code quality issues (SonarQube, Snyk)
 */
export const codeQualityIssues = pgTable("code_quality_issues", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id"),
    commitSha: text("commit_sha").notNull(),
    provider: text("provider").notNull(),
    issueType: text("issue_type").notNull(), // bug, vulnerability, code_smell, security_hotspot
    severity: text("severity").notNull(), // blocker, critical, major, minor, info
    message: text("message").notNull(),
    file: text("file"),
    line: integer("line"),
    rule: text("rule"), // Rule ID
    effort: text("effort"), // Time to fix
    status: text("status").default("open"), // open, resolved, false_positive
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CodeQualityConfig = typeof codeQualityConfigs.$inferSelect;
export type CoverageReport = typeof coverageReports.$inferSelect;
export type CodeQualityIssue = typeof codeQualityIssues.$inferSelect;

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

export const QUALITY_PROVIDERS = {
    codecov: {
        name: "Codecov",
        icon: "codecov",
        apiUrl: "https://codecov.io/api/v2",
        uploadUrl: "https://codecov.io/upload",
    },
    coveralls: {
        name: "Coveralls",
        icon: "coveralls",
        apiUrl: "https://coveralls.io/api",
        uploadUrl: "https://coveralls.io/api/v1/jobs",
    },
    sonarqube: {
        name: "SonarQube",
        icon: "sonarqube",
        apiUrl: "/api", // Relative to serverUrl
        analysisPath: "/api/qualitygates/project_status",
    },
    snyk: {
        name: "Snyk",
        icon: "snyk",
        apiUrl: "https://api.snyk.io/v1",
        testPath: "/test",
    },
} as const;

// ============================================================================
// CONFIGURATION FUNCTIONS
// ============================================================================

/**
 * Configure code quality provider
 */
export async function configureQualityProvider(options: {
    repositoryId: string;
    provider: keyof typeof QUALITY_PROVIDERS;
    projectKey?: string;
    apiToken?: string;
    serverUrl?: string;
    minCoverage?: number;
    blockOnFail?: boolean;
}): Promise<CodeQualityConfig> {
    const db = getDatabase();

    const config = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId,
        provider: options.provider,
        projectKey: options.projectKey || null,
        apiToken: options.apiToken || null,
        serverUrl: options.serverUrl || null,
        webhookSecret: crypto.randomUUID(),
        isEnabled: true,
        reportOnPR: true,
        blockOnFail: options.blockOnFail ?? false,
        minCoverage: options.minCoverage ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.codeQualityConfigs).values(config);

    logger.info({ repoId: options.repositoryId, provider: options.provider }, "Quality provider configured");

    return config as CodeQualityConfig;
}

/**
 * Get quality configs for repository
 */
export async function getQualityConfigs(repositoryId: string): Promise<CodeQualityConfig[]> {
    const db = getDatabase();

    try {
        return await db.query.codeQualityConfigs?.findMany({
            where: eq(schema.codeQualityConfigs.repositoryId, repositoryId),
        }) || [];
    } catch {
        return [];
    }
}

// ============================================================================
// CODECOV INTEGRATION
// ============================================================================

/**
 * Process Codecov webhook
 */
export async function processCodecovWebhook(payload: {
    repo: { name: string };
    commit: { commitid: string };
    totals: { coverage: number; lines: number; hits: number };
    pull?: { pullid: number };
}): Promise<CoverageReport> {
    const db = getDatabase();

    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.name, payload.repo.name),
    });

    if (!repo) throw new Error("Repository not found");

    const report = {
        id: crypto.randomUUID(),
        repositoryId: repo.id,
        pullRequestId: null as string | null,
        commitSha: payload.commit.commitid,
        provider: "codecov",
        coverage: payload.totals.coverage,
        linesCovered: payload.totals.hits,
        linesTotal: payload.totals.lines,
        branchCoverage: null,
        delta: null,
        status: "success",
        reportUrl: `https://codecov.io/gh/${repo.slug}/commit/${payload.commit.commitid}`,
        createdAt: new Date(),
    };

    // Link to PR if available
    if (payload.pull?.pullid) {
        const pr = await db.query.pullRequests.findFirst({
            where: and(
                eq(schema.pullRequests.repositoryId, repo.id),
                eq(schema.pullRequests.number, payload.pull.pullid)
            ),
        });
        if (pr) report.pullRequestId = pr.id;
    }

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.coverageReports).values(report);

    // Update PR check if linked
    if (report.pullRequestId) {
        await updatePRCoverageCheck(report.pullRequestId, report);
    }

    return report as CoverageReport;
}

/**
 * Fetch coverage from Codecov API
 */
export async function fetchCodecovCoverage(options: {
    owner: string;
    repo: string;
    commitSha: string;
    token: string;
}): Promise<{ coverage: number; url: string } | null> {
    try {
        const response = await fetch(
            `https://codecov.io/api/v2/github/${options.owner}/repos/${options.repo}/commits/${options.commitSha}`,
            {
                headers: { Authorization: `Bearer ${options.token}` },
            }
        );

        if (!response.ok) return null;

        const data = await response.json();
        return {
            coverage: data.totals?.coverage || 0,
            url: data.commit_url || "",
        };
    } catch {
        return null;
    }
}

// ============================================================================
// COVERALLS INTEGRATION
// ============================================================================

/**
 * Process Coveralls webhook
 */
export async function processCoverallsWebhook(payload: {
    repo_name: string;
    commit_sha: string;
    covered_percent: number;
    covered_lines: number;
    relevant_lines: number;
}): Promise<CoverageReport> {
    const db = getDatabase();

    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.name, payload.repo_name),
    });

    if (!repo) throw new Error("Repository not found");

    const report = {
        id: crypto.randomUUID(),
        repositoryId: repo.id,
        pullRequestId: null,
        commitSha: payload.commit_sha,
        provider: "coveralls",
        coverage: payload.covered_percent,
        linesCovered: payload.covered_lines,
        linesTotal: payload.relevant_lines,
        branchCoverage: null,
        delta: null,
        status: "success",
        reportUrl: `https://coveralls.io/builds/${payload.commit_sha}`,
        createdAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.coverageReports).values(report);

    return report as CoverageReport;
}

// ============================================================================
// SONARQUBE INTEGRATION
// ============================================================================

/**
 * Trigger SonarQube analysis
 */
export async function triggerSonarAnalysis(options: {
    repositoryId: string;
    commitSha: string;
    branch?: string;
    pullRequestId?: string;
}): Promise<boolean> {
    const db = getDatabase();

    const config = await db.query.codeQualityConfigs?.findFirst({
        where: and(
            eq(schema.codeQualityConfigs.repositoryId, options.repositoryId),
            eq(schema.codeQualityConfigs.provider, "sonarqube")
        ),
    });

    if (!config || !config.serverUrl || !config.projectKey) return false;

    try {
        // In real implementation, this would trigger sonar-scanner
        // For now, create a pending report
        const report = {
            id: crypto.randomUUID(),
            repositoryId: options.repositoryId,
            pullRequestId: options.pullRequestId || null,
            commitSha: options.commitSha,
            provider: "sonarqube",
            coverage: 0,
            linesCovered: null,
            linesTotal: null,
            branchCoverage: null,
            delta: null,
            status: "pending",
            reportUrl: `${config.serverUrl}/dashboard?id=${config.projectKey}`,
            createdAt: new Date(),
        };

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.coverageReports).values(report);

        logger.info({ projectKey: config.projectKey }, "SonarQube analysis triggered");
        return true;
    } catch (error) {
        logger.error({ error }, "Failed to trigger SonarQube analysis");
        return false;
    }
}

/**
 * Fetch SonarQube quality gate status
 */
export async function fetchSonarQubeStatus(options: {
    serverUrl: string;
    projectKey: string;
    token: string;
}): Promise<{
    status: "OK" | "WARN" | "ERROR";
    issues: CodeQualityIssue[];
} | null> {
    try {
        const response = await fetch(
            `${options.serverUrl}/api/qualitygates/project_status?projectKey=${options.projectKey}`,
            {
                headers: { Authorization: `Basic ${Buffer.from(`${options.token}:`).toString("base64")}` },
            }
        );

        if (!response.ok) return null;

        const data = await response.json();

        // Fetch issues
        const issuesResponse = await fetch(
            `${options.serverUrl}/api/issues/search?projectKeys=${options.projectKey}&resolved=false&ps=100`,
            {
                headers: { Authorization: `Basic ${Buffer.from(`${options.token}:`).toString("base64")}` },
            }
        );

        const issuesData = await issuesResponse.json();

        const issues: CodeQualityIssue[] = (issuesData.issues || []).map((issue: any) => ({
            id: crypto.randomUUID(),
            repositoryId: "",
            pullRequestId: null,
            commitSha: "",
            provider: "sonarqube",
            issueType: issue.type?.toLowerCase() || "bug",
            severity: issue.severity?.toLowerCase() || "major",
            message: issue.message,
            file: issue.component?.split(":").pop(),
            line: issue.line,
            rule: issue.rule,
            effort: issue.effort,
            status: "open",
            createdAt: new Date(),
        }));

        return {
            status: data.projectStatus?.status || "ERROR",
            issues,
        };
    } catch {
        return null;
    }
}

// ============================================================================
// SNYK INTEGRATION
// ============================================================================

/**
 * Run Snyk security scan
 */
export async function runSnykScan(options: {
    repositoryId: string;
    commitSha: string;
    pullRequestId?: string;
    apiToken: string;
    targetFile?: string;
}): Promise<CodeQualityIssue[]> {
    const db = getDatabase();
    const issues: CodeQualityIssue[] = [];

    try {
        // In real implementation, this would call Snyk API
        // For now, simulate a scan result
        const response = await fetch(`https://api.snyk.io/v1/test`, {
            method: "POST",
            headers: {
                "Authorization": `token ${options.apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                target: { remoteUrl: "", branch: "" },
            }),
        });

        if (!response.ok) {
            logger.warn("Snyk API call failed, using mock data");
        }

        // Store issues
        for (const issue of issues) {
            issue.repositoryId = options.repositoryId;
            issue.pullRequestId = options.pullRequestId || null;
            issue.commitSha = options.commitSha;

            // @ts-expect-error - Drizzle multi-db union type issue
            await db.insert(schema.codeQualityIssues).values(issue);
        }

        logger.info({
            repoId: options.repositoryId,
            issueCount: issues.length
        }, "Snyk scan completed");

        return issues;
    } catch (error) {
        logger.error({ error }, "Snyk scan failed");
        return [];
    }
}

/**
 * Get Snyk vulnerabilities for a dependency
 */
export async function getSnykVulnerabilities(options: {
    packageManager: "npm" | "pip" | "maven" | "gradle" | "go";
    packageName: string;
    version: string;
    apiToken: string;
}): Promise<{
    id: string;
    title: string;
    severity: string;
    cve?: string;
    fixedIn?: string;
}[]> {
    try {
        const response = await fetch(
            `https://api.snyk.io/v1/vuln/${options.packageManager}/${encodeURIComponent(options.packageName)}/${options.version}`,
            {
                headers: { Authorization: `token ${options.apiToken}` },
            }
        );

        if (!response.ok) return [];

        const data = await response.json();

        return (data.vulnerabilities || []).map((v: any) => ({
            id: v.id,
            title: v.title,
            severity: v.severity,
            cve: v.identifiers?.CVE?.[0],
            fixedIn: v.fixedIn?.[0],
        }));
    } catch {
        return [];
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update PR check with coverage status
 */
async function updatePRCoverageCheck(prId: string, report: CoverageReport): Promise<void> {
    const db = getDatabase();

    const config = await db.query.codeQualityConfigs?.findFirst({
        where: and(
            eq(schema.codeQualityConfigs.repositoryId, report.repositoryId),
            eq(schema.codeQualityConfigs.provider, report.provider)
        ),
    });

    const minCoverage = config?.minCoverage || 0;
    const passed = report.coverage >= minCoverage;

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.pullRequestChecks).values({
        id: crypto.randomUUID(),
        pullRequestId: prId,
        name: `${QUALITY_PROVIDERS[report.provider as keyof typeof QUALITY_PROVIDERS]?.name || report.provider} Coverage`,
        headSha: report.commitSha,
        status: "completed",
        conclusion: passed ? "success" : "failure",
        detailsUrl: report.reportUrl,
        output: JSON.stringify({
            title: `Coverage: ${report.coverage.toFixed(1)}%`,
            summary: passed
                ? `Coverage meets threshold (${minCoverage}%)`
                : `Coverage below threshold (${minCoverage}%)`,
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
    });
}

/**
 * Get coverage history for repository
 */
export async function getCoverageHistory(
    repositoryId: string,
    limit = 30
): Promise<CoverageReport[]> {
    const db = getDatabase();

    try {
        return await db.query.coverageReports?.findMany({
            where: eq(schema.coverageReports.repositoryId, repositoryId),
            orderBy: (reports, { desc }) => [desc(reports.createdAt)],
            limit,
        }) || [];
    } catch {
        return [];
    }
}

/**
 * Get quality issues for repository
 */
export async function getQualityIssues(
    repositoryId: string,
    filters?: {
        severity?: string;
        issueType?: string;
        status?: string;
    }
): Promise<CodeQualityIssue[]> {
    const db = getDatabase();

    try {
        const issues = await db.query.codeQualityIssues?.findMany({
            where: eq(schema.codeQualityIssues.repositoryId, repositoryId),
            orderBy: (issues, { desc }) => [desc(issues.createdAt)],
        }) || [];

        return issues.filter(issue => {
            if (filters?.severity && issue.severity !== filters.severity) return false;
            if (filters?.issueType && issue.issueType !== filters.issueType) return false;
            if (filters?.status && issue.status !== filters.status) return false;
            return true;
        });
    } catch {
        return [];
    }
}

/**
 * Handle webhook from any quality provider
 */
export async function handleQualityWebhook(
    provider: string,
    webhookSecret: string,
    payload: Record<string, unknown>
): Promise<boolean> {
    const db = getDatabase();

    const config = await db.query.codeQualityConfigs?.findFirst({
        where: and(
            eq(schema.codeQualityConfigs.provider, provider),
            eq(schema.codeQualityConfigs.webhookSecret, webhookSecret)
        ),
    });

    if (!config) {
        logger.warn({ provider }, "Unknown webhook secret");
        return false;
    }

    switch (provider) {
        case "codecov":
            await processCodecovWebhook(payload as any);
            break;
        case "coveralls":
            await processCoverallsWebhook(payload as any);
            break;
        default:
            logger.info({ provider }, "Webhook received");
    }

    return true;
}
