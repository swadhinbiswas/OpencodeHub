/**
 * Promisified exec utility
 */

import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}

/**
 * Execute a shell command and return stdout/stderr.
 * Throws on non-zero exit code.
 */
export async function execAsync(
  command: string,
  options: ExecOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return execPromise(command, {
    cwd: options.cwd,
    timeout: options.timeout || 0,
    env: options.env || process.env,
    maxBuffer: options.maxBuffer || 50 * 1024 * 1024, // 50MB
  });
}
