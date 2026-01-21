/**
 * Progress Indicators - GitHub-like output
 */

import chalk from "chalk";
import ora, { Ora } from "ora";
import cliProgress from "cli-progress";

/**
 * GitHub-style object enumeration output
 */
export function showObjectEnumeration(count: number): void {
    console.log(chalk.dim(`  Enumerating objects: ${count}, done.`));
}

/**
 * GitHub-style object counting with progress
 */
export function showObjectCounting(current: number, total: number): void {
    const percentage = Math.floor((current / total) * 100);
    console.log(chalk.dim(`  Counting objects: ${percentage}% (${current}/${total}), done.`));
}

/**
 * GitHub-style compression progress
 */
export function showCompression(objects: number, threads: number = 20): void {
    console.log(chalk.dim(`  Delta compression using up to ${threads} threads`));
    console.log(chalk.dim(`  Compressing objects: 100% (${objects}/${objects}), done.`));
}

/**
 * GitHub-style writing objects
 */
export function showWritingObjects(count: number, size: string, speed: string): void {
    console.log(chalk.dim(`  Writing objects: 100% (${count}/${count}), ${size} | ${speed}, done.`));
    console.log(chalk.dim(`  Total ${count} (delta 0), pack-reused 0`));
}

/**
 * Remote resolution message
 */
export function showRemoteResolving(operation: string, percentage: number, current: number, total: number): void {
    console.log(chalk.dim(`remote: ${operation}: ${percentage}% (${current}/${total}), done.`));
}

/**
 * Create a spinner for long operations
 */
export function createSpinner(text: string): Ora {
    return ora({
        text,
        color: "cyan",
        spinner: "dots",
    });
}

/**
 * Create a progress bar
 */
export function createProgressBar(): cliProgress.SingleBar {
    return new cliProgress.SingleBar({
        format: chalk.cyan("  {bar}") + " | {percentage}% | {value}/{total} {stage}",
        barCompleteChar: "█",
        barIncompleteChar: "░",
        hideCursor: true,
    });
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format speed (bytes/second) to human-readable string
 */
export function formatSpeed(bytesPerSecond: number): string {
    return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Show ref update (like GitHub push output)
 */
export function showRefUpdate(oldSha: string, newSha: string, ref: string, status: "new" | "updated" | "deleted"): void {
    const shortOld = oldSha.substring(0, 7);
    const shortNew = newSha.substring(0, 7);

    let symbol = " ";
    let color = chalk.white;

    if (status === "new") {
        symbol = "*";
        color = chalk.green;
    } else if (status === "updated") {
        symbol = " ";
        color = chalk.cyan;
    } else if (status === "deleted") {
        symbol = "-";
        color = chalk.red;
    }

    const range = status === "new" ? `[new branch]` : `${shortOld}..${shortNew}`;
    console.log(color(`${symbol} ${range.padEnd(20)} ${ref}`));
}
