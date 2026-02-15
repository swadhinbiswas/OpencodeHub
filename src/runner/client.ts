
import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';

const logger = pino({
    name: 'runner-client',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true
        }
    }
});

interface RunnerConfig {
    apiUrl: string;
    token: string; // Registration token
    name: string;
    workDir: string;
}

interface RunnerCredentials {
    id: string;
    token: string; // Private runner token
}

export class RunnerClient {
    private config: RunnerConfig;
    private credentials: RunnerCredentials | null = null;
    private credsPath: string;

    constructor(config: RunnerConfig) {
        this.config = config;
        this.credsPath = path.join(config.workDir, '.runner-credentials.json');
    }

    async init() {
        try {
            const data = await fs.readFile(this.credsPath, 'utf-8');
            this.credentials = JSON.parse(data);
            logger.info({ id: this.credentials?.id }, "Loaded existing runner credentials");
        } catch (e) {
            logger.info("No existing credentials found, waiting for registration");
        }
    }

    async register() {
        if (this.credentials) return;

        logger.info("Registering runner...");
        try {
            const res = await fetch(`${this.config.apiUrl}/api/actions/runners/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: this.config.token,
                    name: this.config.name,
                    os: process.platform,
                    arch: process.arch,
                    version: '1.0.0'
                })
            });

            if (!res.ok) {
                throw new Error(`Registration failed: ${res.statusText} ${await res.text()}`);
            }

            const data = await res.json();
            if (data.success) {
                this.credentials = {
                    id: data.data.id,
                    token: data.data.token
                };
                await fs.writeFile(this.credsPath, JSON.stringify(this.credentials, null, 2));
                logger.info("Runner registered successfully");
            } else {
                throw new Error(data.error || "Unknown registration error");
            }
        } catch (error) {
            logger.error(error, "Failed to register runner");
            throw error;
        }
    }

    async poll() {
        if (!this.credentials) throw new Error("Not registered");

        try {
            const res = await fetch(`${this.config.apiUrl}/api/actions/runners/poll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    runnerId: this.credentials.id,
                    secret: this.credentials.token
                })
            });

            if (res.status === 404) return null; // No job

            if (!res.ok) {
                logger.warn(`Poll error: ${res.status} ${res.statusText}`);
                return null;
            }

            const data = await res.json();
            if (data.success) {
                return data.data; // { id, name, stepName, run }
            }
        } catch (error) {
            logger.error(error, "Poll failed");
        }
        return null;
    }

    async completeJob(jobId: string, result: { success: boolean, logs: string, exitCode: number }) {
        if (!this.credentials) return;

        try {
            const res = await fetch(`${this.config.apiUrl}/api/actions/runners/job/${jobId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    runnerId: this.credentials.id,
                    secret: this.credentials.token,
                    status: result.success ? 'success' : 'failure',
                    exitCode: result.exitCode,
                    logs: result.logs
                })
            });

            if (!res.ok) {
                logger.error(`Failed to report job completion: ${res.statusText}`);
            } else {
                logger.info({ jobId, success: result.success }, "Job completed successfully");
            }
        } catch (error) {
            logger.error(error, "Failed to complete job");
        }
    }
}
