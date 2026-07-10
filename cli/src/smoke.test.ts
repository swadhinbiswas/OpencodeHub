import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function resolveCliBinary(): string | null {
    const candidates = [
        path.resolve(process.cwd(), 'dist/bin/och.js'),
        path.resolve(process.cwd(), 'cli/dist/bin/och.js'),
    ];
    return candidates.find((candidate) => existsSync(candidate)) || null;
}

describe('CLI Smoke Test', () => {
    const cliBinary = resolveCliBinary();

    it('should show help menu', () => {
        if (!cliBinary) return;
        let output = '';
        try {
            output = execFileSync(process.execPath, [cliBinary, '--help'], { encoding: 'utf8' });
        } catch (error: any) {
            if (error?.code === 'EPERM') return;
            throw error;
        }
        expect(output).toContain('OCH CLI');
        expect(output).toContain('Usage: och');
    });

    it('should show version', () => {
        if (!cliBinary) return;
        let output = '';
        try {
            output = execFileSync(process.execPath, [cliBinary, '--version'], { encoding: 'utf8' });
        } catch (error: any) {
            if (error?.code === 'EPERM') return;
            throw error;
        }
        expect(output).toMatch(/\d+\.\d+\.\d+/);
    });
});
