
import { spawn } from "child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { initRepository } from "../src/lib/git";
import { initRepoInStorage, finalizeRepoInit } from "../src/lib/git-storage";

// Configuration
const TEST_OWNER = "test-user";
const TEST_REPO = "test-repo";
const SERVER_URL = "http://localhost:3001";
const GIT_URL = `${SERVER_URL}/git/${TEST_OWNER}/${TEST_REPO}.git`;
const TEMP_DIR = join(process.cwd(), ".tmp", "test-client");

async function setupServerRepo() {
    console.log("--- Setting up Server Repo ---");
    console.log(`Creating ${TEST_OWNER}/${TEST_REPO} in storage...`);

    // 1. Init in storage (prepares temp path)
    const localPath = await initRepoInStorage(TEST_OWNER, TEST_REPO);

    // 2. Init bare repo
    await initRepository(localPath, {
        repoName: TEST_REPO,
        ownerName: TEST_OWNER,
        readme: false // We will push our own
    });

    // 3. Finalize (upload to storage if cloud)
    await finalizeRepoInit(TEST_OWNER, TEST_REPO);

    console.log("Server repo ready.");
}

async function runClientTest() {
    console.log("--- Running Client Test ---");

    // Cleanup client temp
    if (existsSync(TEMP_DIR)) {
        rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEMP_DIR, { recursive: true });

    const sourceDir = join(TEMP_DIR, "source");
    const cloneDir = join(TEMP_DIR, "clone");

    // 1. Create source repo
    mkdirSync(sourceDir);
    await runCmd("git", ["init"], sourceDir);
    await runCmd("git", ["config", "user.email", "test@test.com"], sourceDir);
    await runCmd("git", ["config", "user.name", "Test User"], sourceDir);

    writeFileSync(join(sourceDir, "test.txt"), "Hello Git Server " + Date.now());
    await runCmd("git", ["add", "."], sourceDir);
    await runCmd("git", ["commit", "-m", "Initial commit"], sourceDir);

    // 2. Push to server
    console.log(`Pushing to ${GIT_URL}...`);
    try {
        await runCmd("git", ["push", GIT_URL, "master:main"], sourceDir);
        console.log("Push successful.");
    } catch (err) {
        console.error("Push failed. Is the server running?");
        throw err;
    }

    // 3. Clone from server
    console.log(`Cloning from ${GIT_URL}...`);
    await runCmd("git", ["clone", GIT_URL, cloneDir], TEMP_DIR);

    // 4. Verify content
    if (existsSync(join(cloneDir, "test.txt"))) {
        console.log("SUCCESS: File verified in clone.");
    } else {
        throw new Error("FAILURE: File missing in clone.");
    }
}

function runCmd(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${cmd} exited with code ${code}`));
        });
        child.on('error', reject);
    });
}

// Main
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === "setup") {
        await setupServerRepo();
    } else if (command === "client") {
        await runClientTest();
    } else {
        // Run both if no args, assuming server is handled externally between steps?
        // Actually, we can run setup, BUT the server process needs to be ready.
        // If we run setup here, it sets up the DATA.
        // The server reads the DATA.
        // So we can run setup, then user starts server, then we run client.
        console.log("Usage: bun scripts/test-git-server.ts [setup|client]");
        console.log("1. Run 'setup' to create the repo data.");
        console.log("2. Start the server (npm run dev).");
        console.log("3. Run 'client' to test push/clone.");
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
