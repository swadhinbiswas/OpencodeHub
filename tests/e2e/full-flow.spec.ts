import { expect, test } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const USERNAME = `user_${Date.now()}`;
const PASSWORD = "password123";
const EMAIL = `${USERNAME}@example.com`;
const REPO_NAME = `repo_${Date.now()}`;

test.describe("Full Flow", () => {
  test("Register, Create Repo, Push Code", async ({ page }) => {
    // 1. Register
    await page.goto("/register");
    await page.fill("#username", USERNAME);
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard or login
    await page.waitForURL("**/dashboard");

    // 2. Create Repo
    await page.goto("/new");
    await page.fill("#name", REPO_NAME);
    await page.click('button[type="submit"]');

    // Wait for repo page
    await page.waitForURL(`**/${USERNAME}/${REPO_NAME}`);

    // 3. Push Code
    const repoUrl = `http://${USERNAME}:${PASSWORD}@localhost:4321/${USERNAME}/${REPO_NAME}.git`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencodehub-test-"));

    try {
      execSync("git init", { cwd: tmpDir });
      execSync('git config user.name "Test User"', { cwd: tmpDir });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir });

      fs.writeFileSync(path.join(tmpDir, "README.md"), "# Hello World");
      execSync("git add .", { cwd: tmpDir });
      execSync('git commit -m "Initial commit"', { cwd: tmpDir });
      execSync(`git remote add origin ${repoUrl}`, { cwd: tmpDir });
      execSync("git push -u origin main", { cwd: tmpDir });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // 4. Verify in UI
    await page.reload();
    await expect(page.locator("text=README.md")).toBeVisible();
    await expect(page.locator("text=Hello World")).toBeVisible();
  });
});
