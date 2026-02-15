
import { RunnerClient } from './client';
import { Executor } from './executor';
import pino from 'pino';
import path from 'node:path';
import os from 'node:os';

const logger = pino({
    name: 'runner-main',
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

const CONFIG = {
    apiUrl: process.env.API_URL || process.env.SITE_URL || 'http://localhost:3000',
    token: process.env.RUNNER_TOKEN || '', // Registration token
    name: process.env.RUNNER_NAME || os.hostname(),
    workDir: process.cwd(),
    pollInterval: 5000
};

async function main() {
    logger.info("Starting OpenCodeHub Self-Hosted Runner");
    logger.info({ config: { ...CONFIG, token: '***' } }, "Configuration loaded");

    const client = new RunnerClient(CONFIG);
    const executor = new Executor();

    // Check Docker availability
    const hasDocker = await executor.verifyDocker();
    if (!hasDocker) {
        logger.warn("Docker not detected. Jobs may fail if they rely on container isolation.");
        // In Pro mode, maybe we strictly require Docker? 
        // For now, let's proceed but warn heavily.
    }

    // Initialize (Load creds or Register)
    await client.init();

    // Register if needed
    if (!CONFIG.token && !await client.poll().catch(() => null)) {
        // Hacky check: if poll throws "Not registered" type error, we need token.
        // Actually client.poll() throws if not registered.
    }

    try {
        await client.register();
    } catch (e: any) {
        if (!CONFIG.token) {
            logger.error("Registration failed and no token provided. Set RUNNER_TOKEN env var.");
            process.exit(1);
        }
        // If registration failed but we might have creds? 
        // Client.register checks if creds exist first.
    }

    let isRunning = true;

    // Graceful Shutdown
    const shutdown = () => {
        logger.info("Shutting down runner...");
        isRunning = false;
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    logger.info("Runner is online and polling for jobs...");

    // Polling Loop
    while (isRunning) {
        try {
            const job = await client.poll();

            if (job) {
                logger.info({ jobId: job.id, jobName: job.name }, "Received Job");

                const result = await executor.runJob(job.id, job.run);

                await client.completeJob(job.id, {
                    success: result.success,
                    logs: result.logs,
                    exitCode: result.exitCode
                });
            } else {
                // No job, wait
            }

        } catch (error) {
            logger.error(error, "Error in main loop");
        }

        if (isRunning) {
            await new Promise(r => setTimeout(r, CONFIG.pollInterval));
        }
    }
}

main().catch(err => {
    logger.fatal(err, "Fatal runner error");
    process.exit(1);
});
