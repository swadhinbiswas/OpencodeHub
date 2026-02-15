import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";
import Dockerode from "dockerode";
import { eq } from "drizzle-orm";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { simpleGit } from "simple-git";
import { logger } from "./logger";

const TRIVY_IMAGE = "aquasec/trivy:latest";

export async function runSecurityScan(
    repoPath: string,
    scanId: string,
    repositoryId: string
) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const docker = new Dockerode({ socketPath: "/var/run/docker.sock" });
    const tempDir = join("/tmp", `scan-${scanId}`);

    try {
        // 1. Update status to in_progress
        await db
            .update(schema.securityScans)
            .set({
                status: "in_progress",
                startedAt: new Date(),
            })
            .where(eq(schema.securityScans.id, scanId));

        // 2. Clone repo to temp dir (we need a working copy for Trivy)
        // Since repoPath is a bare repo, we clone it to temp
        await mkdir(tempDir, { recursive: true });
        await simpleGit().clone(repoPath, tempDir);

        // 3. Ensure Trivy image exists
        // We'll skip explicitly pulling to save time if cached, or let run pull it.
        // Ideally we should pull. Let's try to pull but don't fail hard if network issue, just try run.
        try {
            await new Promise((resolve, reject) => {
                docker.pull(TRIVY_IMAGE, (err: any, stream: any) => {
                    if (err) return resolve(false); // Ignore pull error
                    docker.modem.followProgress(stream, onFinished, onProgress);
                    function onFinished(err: any, output: any) {
                        if (err) return resolve(false);
                        resolve(true);
                    }
                    function onProgress(event: any) { }
                });
            });
        } catch (e) {
            logger.warn("Failed to pull Trivy image, trying existing", e);
        }

        // 4. Run Trivy Container
        const chunks: Buffer[] = [];
        const container = await docker.createContainer({
            Image: TRIVY_IMAGE,
            Cmd: [
                "fs",
                "--format",
                "json",
                "--security-checks",
                "vuln,secret,config,license",
                "--output",
                "/workspace/results.json",
                "/workspace",
            ],

            HostConfig: {
                Binds: [`${tempDir}:/workspace`], // Read/Write mount for results
            },
            AttachStdout: true,
            AttachStderr: true,
        });

        await container.start();

        const stream = await container.logs({ follow: true, stdout: true, stderr: true });

        // Wait for container to finish
        const waitData = await container.wait();

        if (waitData.StatusCode !== 0) {
            // Non-zero exit code means tool error or vulnerability found (if exit-code set)
        }

        // 5. Parse Results from File
        const resultsPath = join(tempDir, "results.json");
        let scanResults;
        try {
            const fs = await import("fs/promises");
            const fileContent = await fs.readFile(resultsPath, "utf-8");
            scanResults = JSON.parse(fileContent);
        } catch (e) {
            throw new Error(`Failed to read/parse Trivy results file: ${e}`);
        }

        // 6. Save Findings
        let critical = 0, high = 0, medium = 0, low = 0, unknown = 0;

        if (scanResults.Results) {
            for (const res of scanResults.Results) {
                const target = res.Target;
                const resClass = res.Class; // os-pkgs, etc

                // Handle Vulnerabilities
                if (res.Vulnerabilities) {
                    for (const vuln of res.Vulnerabilities) {
                        const severity = vuln.Severity;
                        if (severity === "CRITICAL") critical++;
                        else if (severity === "HIGH") high++;
                        else if (severity === "MEDIUM") medium++;
                        else if (severity === "LOW") low++;
                        else unknown++;

                        await db.insert(schema.securityVulnerabilities).values({
                            id: generateId(),
                            scanId: scanId,
                            vulnerabilityId: vuln.VulnerabilityID,
                            pkgName: vuln.PkgName,
                            installedVersion: vuln.InstalledVersion,
                            fixedVersion: vuln.FixedVersion,
                            severity: vuln.Severity,
                            title: vuln.Title,
                            description: vuln.Description,
                            target: target,
                            class: resClass
                        });
                    }
                }

                // Handle Secrets
                if (res.Secrets) {
                    for (const secret of res.Secrets) {
                        critical++; // Treat secrets as critical
                        await db.insert(schema.securityVulnerabilities).values({
                            id: generateId(),
                            scanId: scanId,
                            vulnerabilityId: "SECRET",
                            pkgName: secret.Title || "Secret Detected",
                            installedVersion: "",
                            fixedVersion: "",
                            severity: "CRITICAL",
                            title: `Secret found: ${secret.Title}`,
                            description: `Match: ${secret.Match}`,
                            target: target,
                            class: "secret"
                        });
                    }
                }

                // Handle Licenses
                if (res.Licenses) {
                    for (const license of res.Licenses) {
                        // Trivy classifies licenses too (e.g. AGPL might be HIGH severity in enterprise config)
                        // If severity is missing, default to LOW
                        const severity = license.Severity || "LOW";
                        if (severity === "CRITICAL") critical++;
                        else if (severity === "HIGH") high++;
                        else if (severity === "MEDIUM") medium++;
                        else if (severity === "LOW") low++;
                        else unknown++;

                        await db.insert(schema.securityVulnerabilities).values({
                            id: generateId(),
                            scanId: scanId,
                            vulnerabilityId: `LICENSE-${license.Name}`,
                            pkgName: license.PkgName,
                            installedVersion: "",
                            fixedVersion: "",
                            severity: severity,
                            title: `License: ${license.Name}`,
                            description: `Category: ${license.Category}`,
                            target: target,
                            class: "license"
                        });
                    }
                }
            }
        }

        // 7. Update Scan Record
        await db.update(schema.securityScans)
            .set({
                status: "completed",
                completedAt: new Date(),
                criticalCount: critical,
                highCount: high,
                mediumCount: medium,
                lowCount: low,
                unknownCount: unknown,
            })
            .where(eq(schema.securityScans.id, scanId));

    } catch (error: any) {
        logger.error("Security scan failed:", error);
        await db.update(schema.securityScans)
            .set({
                status: "failed",
                completedAt: new Date(),
                logs: error.message
            })
            .where(eq(schema.securityScans.id, scanId));
    } finally {
        // Cleanup temp dir
        await rm(tempDir, { recursive: true, force: true });
    }
}
