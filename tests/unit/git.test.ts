import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initRepository, isRepoEmpty, getGit } from '@/lib/git';
import * as fs from 'fs';
import { simpleGit } from 'simple-git';

// Mock simple-git
vi.mock('simple-git', () => {
    const mGit = {
        init: vi.fn(),
        addConfig: vi.fn(),
        add: vi.fn(),
        commit: vi.fn(),
        branch: vi.fn(),
        addRemote: vi.fn(),
        push: vi.fn(),
        raw: vi.fn(),
        env: vi.fn(),
    };
    return {
        simpleGit: vi.fn(() => mGit),
    };
});

// Mock fs
vi.mock('fs', async () => {
    return {
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        rmSync: vi.fn(),
        readdirSync: vi.fn(() => []),
    };
});

// Mock fs/promises
vi.mock('fs/promises', async () => {
    return {
        writeFile: vi.fn(),
        mkdir: vi.fn(),
        rm: vi.fn(),
        unlink: vi.fn(),
    };
});

// Mock child_process for hooks
vi.mock('child_process', () => ({
    spawn: vi.fn(),
}));

describe('Git Library', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initRepository', () => {
        it('should initialize a bare repository', async () => {
            const repoPath = '/tmp/test-repo.git';
            // We rely on real path.dirname, so no need to mock it.
            // But we need to mock existSync behavior
            (fs.existsSync as any).mockReturnValue(false); // Parent dir doesn't exist

            await initRepository(repoPath, { repoName: 'Test Repo', skipHooks: true });

            expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp', { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith(repoPath, { recursive: true });
            expect(simpleGit).toHaveBeenCalledWith(repoPath);

            const git = simpleGit(repoPath);
            expect(git.init).toHaveBeenCalledWith(true);
        });
    });

    describe('isRepoEmpty', () => {
        it('should return true if rev-parse HEAD fails', async () => {
            const repoPath = '/tmp/empty-repo.git';
            (simpleGit as any).mockReturnValue({
                env: vi.fn(),
                raw: vi.fn().mockRejectedValue(new Error('ambiguous argument')),
            } as any);

            const isEmpty = await isRepoEmpty(repoPath);
            expect(isEmpty).toBe(true);
        });

        it('should return false if rev-parse HEAD succeeds', async () => {
            const repoPath = '/tmp/full-repo.git';
            (simpleGit as any).mockReturnValue({
                env: vi.fn(),
                raw: vi.fn().mockResolvedValue('hash'),
            } as any);

            const isEmpty = await isRepoEmpty(repoPath);
            expect(isEmpty).toBe(false);
        });
    });
});
