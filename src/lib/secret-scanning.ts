import { getCommit, getFileContent, listFiles } from "@/lib/git";
import { scanForSecrets } from "@/lib/security-advanced";
import { logger } from "@/lib/logger";

interface ScanOptions {
    repoPath: string;
    repositoryId: string;
    ref?: string;
    maxFiles?: number;
    maxFileSizeBytes?: number;
}

async function collectFilePaths(
    repoPath: string,
    ref: string,
    startPath: string,
    maxFiles: number,
    results: string[]
): Promise<void> {
    if (results.length >= maxFiles) return;

    const entries = await listFiles(repoPath, ref, startPath);

    for (const entry of entries) {
        if (results.length >= maxFiles) return;

        if (entry.type === "directory") {
            await collectFilePaths(repoPath, ref, entry.path, maxFiles, results);
        } else if (entry.type === "file") {
            results.push(entry.path);
        }
    }
}

export async function scanRepositoryForSecrets(options: ScanOptions): Promise<{
    commitSha: string;
    findings: number;
}> {
    const ref = options.ref || "HEAD";
    const maxFiles = options.maxFiles ?? 2000;
    const maxFileSizeBytes = options.maxFileSizeBytes ?? 200 * 1024;

    const commit = await getCommit(options.repoPath, ref);
    const commitSha = commit?.sha || ref;

    const filePaths: string[] = [];
    await collectFilePaths(options.repoPath, ref, "", maxFiles, filePaths);

    const files: { path: string; content: string }[] = [];

    for (const filePath of filePaths) {
        const file = await getFileContent(options.repoPath, filePath, ref);
        if (!file || file.isBinary) continue;
        if (file.size > maxFileSizeBytes) continue;

        files.push({ path: filePath, content: file.content });
    }

    const results = await scanForSecrets({
        repositoryId: options.repositoryId,
        commitSha,
        files,
    });

    logger.info({
        repositoryId: options.repositoryId,
        commitSha,
        fileCount: files.length,
        findings: results.length,
    }, "Secret scan completed");

    return { commitSha, findings: results.length };
}
