import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

/**
 * OpenCodeHub CI Runner
 * Zero-Trust Execution Environment using Docker-in-Docker isolation
 */

export interface RunnerOptions {
  jobId: string;
  image: string;
  repositoryUrl: string;
  commitHash: string;
  env: Record<string, string>;
  command: readonly string[];
}

export class IsolatedDockerRunner {
  static async executeJob(options: RunnerOptions): Promise<{ exitCode: number, logs: string }> {
    const containerName = `och-runner-${options.jobId}-${randomUUID().slice(0, 8)}`;
    
    // Secure isolated execution:
    // 1. No root privileges on host (--privileged only if docker-in-docker explicitly enabled, but avoided here for standard jobs)
    // 2. Memory and CPU constraints
    // 3. Network isolation
    const dockerArgs = [
      'run',
      '--name', containerName,
      '--rm', // Auto-remove container when done
      '--memory=2g',
      '--cpus=2',
      '--network=none', // Default to isolated network for static analysis (can be bridged if internet needed)
    ];

    // Inject environment variables safely
    for (const [key, value] of Object.entries(options.env || {})) {
      dockerArgs.push('-e', `${key}=${String(value).replace(/'/g, "'\\''")}`); // Basic escape
    }

    dockerArgs.push(options.image);
    dockerArgs.push(...options.command);

    console.log(`[CI] Starting isolated job ${options.jobId} in container ${containerName}`);

    return new Promise((resolve) => {
      const child = spawn('docker', dockerArgs);
      
      let logs = '';
      
      child.stdout.on('data', (data) => logs += data.toString());
      child.stderr.on('data', (data) => logs += data.toString());
      
      child.on('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          logs
        });
      });

      // Timeout safeguard (e.g., 10 minutes)
      setTimeout(() => {
        child.kill(); // Terminate local process
        spawn('docker', ['rm', '-f', containerName]); // Forcibly terminate runaway container
        resolve({ exitCode: 124, logs: logs + '\n[ERROR] Job Timed Out after 10 minutes.' });
      }, 10 * 60 * 1000);
    });
  }
}
