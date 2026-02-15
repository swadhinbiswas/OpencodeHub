
import Docker from 'dockerode';
import pino from 'pino';
import { Writable } from 'stream';

const logger = pino({
    name: 'runner-executor',
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

// Default resource limits for job containers
const DEFAULT_LIMITS = {
    memoryMb: parseInt(process.env.EXECUTOR_MEMORY_MB || "2048", 10),
    cpuShares: parseInt(process.env.EXECUTOR_CPU_SHARES || "1024", 10),
    cpuCount: parseInt(process.env.EXECUTOR_CPU_COUNT || "2", 10), // NanoCpus
    timeoutSeconds: parseInt(process.env.EXECUTOR_TIMEOUT_SECONDS || "3600", 10),
    maxLogBytes: parseInt(process.env.EXECUTOR_MAX_LOG_BYTES || String(10 * 1024 * 1024), 10),
};

// Patterns for secrets that should be redacted from logs
const SECRET_PATTERNS = [
    /(?:password|secret|token|api[_-]?key|auth|credential|bearer)[\s]*[=:]\s*['"]?([^'"\s]+)['"]?/gi,
    /ghp_[a-zA-Z0-9]{36}/g,               // GitHub personal access tokens
    /sk-[a-zA-Z0-9]{48}/g,                 // OpenAI API keys
    /sk-ant-[a-zA-Z0-9-]{93}/g,            // Anthropic API keys
    /xox[baprs]-[a-zA-Z0-9-]+/g,           // Slack tokens
    /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*/g, // JWT tokens
];

export interface ExecutorOptions {
    memoryMb?: number;
    cpuShares?: number;
    cpuCount?: number;
    timeoutSeconds?: number;
    maxLogBytes?: number;
    env?: Record<string, string>;
    workDir?: string;
}

export class Executor {
    private docker: Docker;

    constructor() {
        this.docker = new Docker();
    }

    async verifyDocker() {
        try {
            await this.docker.ping();
            logger.info("Docker is available");
            return true;
        } catch (e) {
            logger.error("Docker is NOT available. Please install Docker or ensure the runner has permissions.");
            return false;
        }
    }

    /**
     * Redact secrets from log output
     */
    private redactSecrets(text: string): string {
        let redacted = text;
        for (const pattern of SECRET_PATTERNS) {
            redacted = redacted.replace(pattern, (match) => {
                // Keep first 4 chars visible for debugging
                const visible = match.substring(0, 4);
                return `${visible}${'*'.repeat(Math.max(4, match.length - 4))}[REDACTED]`;
            });
        }
        return redacted;
    }

    /**
     * Run a job with resource limits, timeout, and log sanitization
     */
    async runJob(
        jobId: string,
        script: string,
        image = 'node:20-slim',
        options: ExecutorOptions = {}
    ): Promise<{ success: boolean; logs: string; exitCode: number; timedOut?: boolean }> {
        const containerName = `och-runner-${jobId}-${Date.now()}`;
        const limits = {
            memoryMb: options.memoryMb ?? DEFAULT_LIMITS.memoryMb,
            cpuShares: options.cpuShares ?? DEFAULT_LIMITS.cpuShares,
            timeoutSeconds: options.timeoutSeconds ?? DEFAULT_LIMITS.timeoutSeconds,
            maxLogBytes: options.maxLogBytes ?? DEFAULT_LIMITS.maxLogBytes,
        };

        let logs = '';
        let logBytes = 0;
        let logsTruncated = false;
        let container: Docker.Container | null = null;

        const logStream = new Writable({
            write: (chunk, encoding, callback) => {
                const chunkStr = chunk.toString();
                const redactedChunk = this.redactSecrets(chunkStr);

                // Check log size limit
                if (logBytes + redactedChunk.length > limits.maxLogBytes) {
                    if (!logsTruncated) {
                        logs += '\n[LOG TRUNCATED: Exceeded maximum log size]\n';
                        logsTruncated = true;
                    }
                } else {
                    logs += redactedChunk;
                    logBytes += redactedChunk.length;
                    // Stream to stdout for visibility (also redacted)
                    process.stdout.write(redactedChunk);
                }
                callback();
            }
        });

        // Setup timeout
        const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
            setTimeout(() => {
                resolve({ timedOut: true });
            }, limits.timeoutSeconds * 1000);
        });

        try {
            logger.info({
                image,
                containerName,
                memoryMb: limits.memoryMb,
                cpuShares: limits.cpuShares,
                timeoutSeconds: limits.timeoutSeconds
            }, "Starting job container with resource limits");

            container = await this.docker.createContainer({
                Image: image,
                Cmd: ['/bin/sh', '-c', script],
                Tty: false,
                name: containerName,
                Env: options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
                WorkingDir: options.workDir,
                HostConfig: {
                    // Memory limit in bytes
                    Memory: limits.memoryMb * 1024 * 1024,
                    // Memory + swap limit (same as Memory to disable swap)
                    MemorySwap: limits.memoryMb * 1024 * 1024,
                    // CPU shares (relative weight)
                    CpuShares: limits.cpuShares,
                    // Limit CPUs (NanoCpus is int64, unit is 1e-9 CPUs)
                    NanoCpus: (options.cpuCount ?? DEFAULT_LIMITS.cpuCount) * 1e9,
                    // Security: prevent container from gaining new privileges
                    SecurityOpt: ['no-new-privileges:true'],
                    // Read-only root filesystem (can be overridden if needed)
                    // ReadonlyRootfs: true,
                    // Disable network by default for security (uncomment if needed)
                    // NetworkMode: 'none',
                    // Auto-remove on stop
                    AutoRemove: false, // We remove manually after getting logs
                    // Limit PIDs to prevent fork bombs
                    PidsLimit: 256,
                }
            });

            const stream = await container.attach({
                stream: true,
                stdout: true,
                stderr: true
            });

            stream.pipe(logStream);

            await container.start();

            // Race between completion and timeout
            const waitPromise = container.wait().then(result => ({ result, timedOut: false }));
            const outcome = await Promise.race([waitPromise, timeoutPromise]);

            if ('timedOut' in outcome && outcome.timedOut) {
                logger.warn({ jobId, containerName, timeoutSeconds: limits.timeoutSeconds },
                    "Job timed out, killing container");

                try {
                    await container.kill();
                } catch (killError) {
                    logger.error({ error: killError }, "Failed to kill timed-out container");
                }

                logs += `\n[JOB TIMED OUT after ${limits.timeoutSeconds} seconds]\n`;

                return {
                    success: false,
                    exitCode: 124, // Standard timeout exit code
                    logs,
                    timedOut: true
                };
            }

            const { result } = outcome as { result: { StatusCode: number }; timedOut: false };

            // Small delay to ensure logs flush
            await new Promise(r => setTimeout(r, 500));

            await container.remove();

            return {
                success: result.StatusCode === 0,
                exitCode: result.StatusCode,
                logs
            };

        } catch (error: any) {
            logger.error(error, "Job execution failed");

            // Attempt to clean up container on error
            if (container) {
                try {
                    await container.stop({ t: 5 }).catch(() => { });
                    await container.remove().catch(() => { });
                } catch {
                    // Ignore cleanup errors
                }
            }

            return {
                success: false,
                exitCode: 1,
                logs: logs + `\nRunner System Error: ${this.redactSecrets(error.message)}`
            };
        }
    }

    /**
     * Cancel a running job by container name pattern
     */
    async cancelJob(jobId: string): Promise<boolean> {
        try {
            const containers = await this.docker.listContainers({
                filters: { name: [`och-runner-${jobId}`] }
            });

            for (const containerInfo of containers) {
                const container = this.docker.getContainer(containerInfo.Id);
                logger.info({ jobId, containerId: containerInfo.Id }, "Cancelling job");
                await container.stop({ t: 5 });
                await container.remove();
            }

            return containers.length > 0;
        } catch (error) {
            logger.error({ error, jobId }, "Failed to cancel job");
            return false;
        }
    }
}
