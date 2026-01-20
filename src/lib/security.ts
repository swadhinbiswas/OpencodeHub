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
                "vuln,secret,config",
                "/workspace",
            ],
            HostConfig: {
                Binds: [`${tempDir}:/workspace:ro`], // Read only mount
            },
            AttachStdout: true,
            AttachStderr: true,
        });

        await container.start();

        const stream = await container.logs({ follow: true, stdout: true, stderr: true });

        // Collect output
        // Docker logs stream is multiplexed. We need to demultiplex if using 'logs'
        // But since we attached, we might need a stream?
        // Actually simpler: just wait for run to finish and get logs?
        // container.logs gives existing logs.
        // Let's use container.wait() then get logs? Or stream.

        // Simpler approach for Dockerode:
        // attach stream is raw stream.

        // Let's retry simple approach: container.wait() then container.logs()
        const waitData = await container.wait();

        if (waitData.StatusCode !== 0) {
            // It might fail if vulnerabilities found? No, --exit-code default is 0.
            // Only fails on error.
            // However, if we want to fail pipeline on vuln, we set exit-code. Here we just want report.
            // So non-zero means Tool Error.
        }

        // Get Logs (Output is in stdout)
        // Note: Trivy JSON output goes to stdout.
        const logsBuffer = await container.logs({ stdout: true, stderr: false });
        // logsBuffer is a buffer with header bytes for each frame if TTY=false.
        // If we didn't set Tty: true, we get multiplexed frames.
        // We need to strip them.
        // Or we use a simpler way: write to a file in the volume?
        // "trivy fs ... --output /workspace/results.json"
        // Since we mounted :ro, we can't write there.
        // We can mount a results volume? Or just parse the buffer.

        // Parsing buffer: The docker headers are 8 bytes.
        // [StreamType (1 byte), 0, 0, 0, Size (4 bytes big endian)]
        // We can clean it.

        // ALTERNATIVE: Use `docker.run` (helper) which handles streams?
        // Let's manually clean the buffer, it's reliable.

        const rawOutput = logsBuffer.toString("utf-8");
        // This will be mixed if we don't demux properly.
        // Let's try to demultiplex.

        let jsonOutput = "";

        // Helper to demux
        let currentIdx = 0;
        while (currentIdx < logsBuffer.length) {
            // const type = logsBuffer[currentIdx]; // 1=stdout, 2=stderr
            const size = logsBuffer.readUInt32BE(currentIdx + 4);
            const content = logsBuffer.subarray(currentIdx + 8, currentIdx + 8 + size);
            // We only care about stdout (1)
            if (logsBuffer[currentIdx] === 1) {
                jsonOutput += content.toString("utf-8");
            }
            currentIdx += 8 + size;
        }

        await container.remove();

        // 5. Parse Results
        let scanResults;
        try {
            scanResults = JSON.parse(jsonOutput);
        } catch (e) {
            throw new Error(`Failed to parse Trivy output: ${e}. Output start: ${jsonOutput.substring(0, 100)}...`);
        }

        // 6. Save Findings
        let critical = 0, high = 0, medium = 0, low = 0, unknown = 0;

        if (scanResults.Results) {
            for (const res of scanResults.Results) {
                const target = res.Target;
                const resClass = res.Class; // os-pkgs, etc

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
