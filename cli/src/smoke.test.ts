import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('CLI Smoke Test', () => {
    it('should show help menu', () => {
        const output = execSync('node dist/bin/och.js --help').toString();
        expect(output).toContain('OpenCodeHub CLI');
        expect(output).toContain('Usage: och');
    });

    it('should show version', () => {
        const output = execSync('node dist/bin/och.js --version').toString();
        expect(output).toMatch(/\d+\.\d+\.\d+/);
    });
});
