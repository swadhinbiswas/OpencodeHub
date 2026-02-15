import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initRepository, getBranches, compareBranches, createBranch, deleteBranch } from '@/lib/git';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { simpleGit } from 'simple-git';
import { randomUUID } from 'crypto';

const TEST_DIR = join(process.cwd(), 'test-results', 'git-branching', randomUUID());
const REPO_PATH = join(TEST_DIR, 'repo.git');
const CLIENT_PATH = join(TEST_DIR, 'client');

describe('Git Branching and Pull Requests', () => {
    beforeAll(async () => {
        // Setup
        mkdirSync(TEST_DIR, { recursive: true });

        // 1. Init server repo
        await initRepository(REPO_PATH, {
            readme: true,
            defaultBranch: 'main',
            ownerName: 'TestUser',
            skipHooks: true
        });

        // 2. Clone to client
        await simpleGit().clone(REPO_PATH, CLIENT_PATH);
        const client = simpleGit(CLIENT_PATH);

        // Configure client
        await client.addConfig('user.name', 'Tester');
        await client.addConfig('user.email', 'test@example.com');
    });

    afterAll(() => {
        // Cleanup
        try {
            rmSync(TEST_DIR, { recursive: true, force: true });
        } catch (e) {
            console.error("Cleanup failed", e);
        }
    });

    it('should list default branch', async () => {
        const branches = await getBranches(REPO_PATH);
        expect(branches).toHaveLength(1);
        expect(branches[0].name).toBe('main');
        expect(branches[0].isDefault).toBe(true);
    });

    it('should create a new branch via API (server-side)', async () => {
        await createBranch(REPO_PATH, 'feature-1', 'main');
        const branches = await getBranches(REPO_PATH);
        expect(branches).toHaveLength(2);
        expect(branches.find(b => b.name === 'feature-1')).toBeDefined();
    });

    it('should compare branches correctly', async () => {
        // 1. Client: checkout feature-1 (fetch first to get it from server)
        const client = simpleGit(CLIENT_PATH);
        await client.fetch();
        await client.checkout('feature-1');

        // 2. Make changes
        writeFileSync(join(CLIENT_PATH, 'new-feature.txt'), 'Awesome feature content');
        await client.add('.');
        await client.commit('Add new feature');
        await client.push('origin', 'feature-1');

        // 3. Compare main and feature-1
        const { commits, diffs } = await compareBranches(REPO_PATH, 'main', 'feature-1');

        expect(commits).toHaveLength(1);
        expect(commits[0].message).toBe('Add new feature');

        expect(diffs).toHaveLength(1);
        expect(diffs[0].file).toBe('new-feature.txt');
        expect(diffs[0].status).toBe('modified'); // Note: We mapped everything to 'modified' in our simplified impl, or check logic
    });

    it('should delete branch', async () => {
        await deleteBranch(REPO_PATH, 'feature-1');
        const branches = await getBranches(REPO_PATH);
        expect(branches).toHaveLength(1);
        expect(branches[0].name).toBe('main');
    });
});
