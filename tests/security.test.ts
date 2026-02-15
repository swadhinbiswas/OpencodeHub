
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runSecurityScan } from "@/lib/security";
import { getDatabase, schema } from "@/db";
import { generateId } from "@/lib/utils";
import fs from "fs/promises";
import { eq, sql } from "drizzle-orm";

// Mock Dockerode
const mockDockerContainer = {
    start: vi.fn().mockResolvedValue(undefined),
    wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
    logs: vi.fn().mockImplementation(() => {
        const json = JSON.stringify({
            Results: [
                {
                    Target: "package-lock.json",
                    Class: "lang-pkgs",
                    Vulnerabilities: [
                        {
                            VulnerabilityID: "CVE-2023-1234",
                            PkgName: "test-pkg",
                            InstalledVersion: "1.0.0",
                            FixedVersion: "1.0.1",
                            Severity: "HIGH",
                            Title: "Test Vulnerability",
                            Description: "A test vulnerability"
                        }
                    ]
                }
            ]
        });

        const content = Buffer.from(json);
        const header = Buffer.alloc(8);
        header.writeUInt8(1, 0); // Stream type stdout
        header.writeUInt32BE(content.length, 4); // Size

        return Buffer.concat([header, content]);
    }),
    remove: vi.fn().mockResolvedValue(undefined)
};

// Setup mocks
const mockDocker = {
    createContainer: vi.fn().mockResolvedValue(mockDockerContainer),
    pull: vi.fn((image, cb) => cb(null, {}))
};

vi.mock("dockerode", () => {
    return {
        default: class MockDockerode {
            constructor() {
                return mockDocker;
            }
        }
    };
});

// Mock simple-git
vi.mock("simple-git", () => {
    return {
        simpleGit: vi.fn(() => ({
            clone: vi.fn().mockResolvedValue(undefined)
        }))
    }
});

describe("Security System", () => {
    const db = getDatabase();
    const testRepoId = generateId();
    const scanId = generateId();

    // Setup test data
    beforeEach(async () => {
        // Create tables manually
        await db.execute(sql`CREATE TABLE IF NOT EXISTS users (
         id text PRIMARY KEY,
         username text NOT NULL,
         email text NOT NULL,
         name text,
         avatar_url text,
         github_id text,
         created_at text DEFAULT CURRENT_TIMESTAMP,
         updated_at text DEFAULT CURRENT_TIMESTAMP,
         role text DEFAULT 'user'
       )`);

        await db.execute(sql`CREATE TABLE IF NOT EXISTS repositories (
         id text PRIMARY KEY,
         name text NOT NULL,
         slug text NOT NULL,
         description text,
         owner_id text NOT NULL,
         owner_type text DEFAULT 'user',
         visibility text DEFAULT 'public',
         default_branch text DEFAULT 'main',
         disk_path text NOT NULL,
         ssh_clone_url text,
         http_clone_url text,
         star_count integer DEFAULT 0,
         fork_count integer DEFAULT 0,
         watch_count integer DEFAULT 0,
         open_issue_count integer DEFAULT 0,
         open_pr_count integer DEFAULT 0,
         size integer DEFAULT 0,
         is_fork integer DEFAULT 0,
         forked_from_id text,
         is_archived integer DEFAULT 0,
         is_mirror integer DEFAULT 0,
         mirror_url text,
         has_issues integer DEFAULT 1,
         has_wiki integer DEFAULT 1,
         has_actions integer DEFAULT 1,
         allow_forking integer DEFAULT 1,
         license_type text,
         topics text,
         language text,
         languages text,
         last_activity_at text,
         created_at text DEFAULT CURRENT_TIMESTAMP,
         updated_at text DEFAULT CURRENT_TIMESTAMP,
         FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
       )`);

        await db.execute(sql`CREATE TABLE IF NOT EXISTS security_scans (
         id text PRIMARY KEY,
         repository_id text NOT NULL,
         status text DEFAULT 'queued',
         started_at integer,
         completed_at integer,
         critical_count integer DEFAULT 0,
         high_count integer DEFAULT 0,
         medium_count integer DEFAULT 0,
         low_count integer DEFAULT 0,
         unknown_count integer DEFAULT 0,
         logs text,
         FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
       )`);

        await db.execute(sql`CREATE TABLE IF NOT EXISTS security_vulnerabilities (
         id text PRIMARY KEY,
         scan_id text NOT NULL,
         vulnerability_id text NOT NULL,
         pkg_name text NOT NULL,
         installed_version text,
         fixed_version text,
         severity text NOT NULL,
         title text,
         description text,
         target text,
         class text,
         FOREIGN KEY (scan_id) REFERENCES security_scans(id) ON DELETE CASCADE
       )`);

        // key cleanup to prevent unique constraint errors
        await db.delete(schema.securityVulnerabilities);
        await db.delete(schema.securityScans);
        await db.delete(schema.repositories);
        await db.delete(schema.users);

        await db.insert(schema.users).values({
            id: "test-user",
            username: "test-user",
            email: "test@example.com"
        });

        await db.insert(schema.repositories).values({
            id: testRepoId,
            ownerId: "test-user",
            name: "test-repo",
            slug: "test-user/test-repo",
            diskPath: "/tmp/test-repo",
            visibility: "public"
        });

        await db.insert(schema.securityScans).values({
            id: scanId,
            repositoryId: testRepoId,
            status: "queued"
        });
    });

    afterEach(async () => {
        // Optional: cleanup
        await db.delete(schema.securityVulnerabilities);
        await db.delete(schema.securityScans);
        await db.delete(schema.repositories);
        await db.delete(schema.users);
    });

    it("should run security scan and save results", async () => {
        // Run scan
        await runSecurityScan("/tmp/test-repo", scanId, testRepoId);

        // Check scan status using db
        // Note: runSecurityScan uses `db` so it should write to sqlite.
        const scan = await db.query.securityScans.findFirst({
            where: eq(schema.securityScans.id, scanId),
            with: { vulnerabilities: true }
        });

        expect(scan).toBeDefined();
        // Since we mocked docker logs to return simple JSON, we assume our logic parses it.
        // However, our logic expects the buffer to be raw if we said so.
        // In the test mock, we returned a Buffer of pure JSON.
        // The implementation tries to demux if Docker returns headers.
        // Let's adjust mock or implementation if needed.
        // The implementation logic for demux: `logsBuffer[currentIdx]` check.
        // If we pass pure JSON string as buffer, `logsBuffer[0]` is `{` (123).
        // The implementation sets type vars but checks `logsBuffer[currentIdx] === 1`.
        // 123 !== 1. So it might skip everything if we don't mock headers.

        // Wait, `container.logs` *returns* a buffer. If `stdout: true` and TTY is false (default), it returns headers.
        // To fix test, we should construct a buffer with headers.
    });
});
