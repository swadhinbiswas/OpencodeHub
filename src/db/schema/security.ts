import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { relations } from "drizzle-orm";

export const securityScans = pgTable("security_scans", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"), // queued, in_progress, completed, failed
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    criticalCount: integer("critical_count").default(0),
    highCount: integer("high_count").default(0),
    mediumCount: integer("medium_count").default(0),
    lowCount: integer("low_count").default(0),
    unknownCount: integer("unknown_count").default(0),
    logs: text("logs"),
});

export const securityVulnerabilities = pgTable("security_vulnerabilities", {
    id: text("id").primaryKey(),
    scanId: text("scan_id")
        .notNull()
        .references(() => securityScans.id, { onDelete: "cascade" }),
    vulnerabilityId: text("vulnerability_id").notNull(), // e.g. CVE-2023-1234
    pkgName: text("pkg_name").notNull(),
    installedVersion: text("installed_version"),
    fixedVersion: text("fixed_version"),
    severity: text("severity").notNull(), // CRITICAL, HIGH, MEDIUM, LOW, UNKNOWN
    title: text("title"),
    description: text("description"),
    target: text("target"), // e.g. package-lock.json
    class: text("class"), // os-pkgs, lang-pkgs, secret
});

export const securityScansRelations = relations(securityScans, ({ one, many }) => ({
    repository: one(repositories, {
        fields: [securityScans.repositoryId],
        references: [repositories.id],
    }),
    vulnerabilities: many(securityVulnerabilities),
}));

export const securityVulnerabilitiesRelations = relations(securityVulnerabilities, ({ one }) => ({
    scan: one(securityScans, {
        fields: [securityVulnerabilities.scanId],
        references: [securityScans.id],
    }),
}));
