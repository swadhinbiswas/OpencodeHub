import { getCommits, initRepository, mergeBranch } from "@/lib/git";
import fs from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_REPO_PATH = path.join(
  process.cwd(),
  "data",
  "test-repos",
  "integration-test.git"
);

describe("Git Integration", () => {
  beforeAll(async () => {
    await fs.rm(TEST_REPO_PATH, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_REPO_PATH, { recursive: true, force: true });
  });

  it("should initialize a repository", async () => {
    await initRepository(TEST_REPO_PATH, {
      repoName: "integration-test",
      ownerName: "tester",
      readme: true,
      skipHooks: true,
    });

    const exists = await fs
      .stat(TEST_REPO_PATH)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("should get commits", async () => {
    const commits = await getCommits(TEST_REPO_PATH);
    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0].message).toBe("Initial commit");
  });

  it("should merge a non-main head branch into main", async () => {
    const { simpleGit } = await import("simple-git");
    const tmp = path.join(process.cwd(), "data", "test-repos", "integration-work");
    await fs.rm(tmp, { recursive: true, force: true });

    const work = simpleGit();
    await work.clone(TEST_REPO_PATH, tmp);
    const workGit = simpleGit({ baseDir: tmp });
    await workGit.checkout(["-b", "feature/merge-test"]);
    await fs.writeFile(path.join(tmp, "feature-file.txt"), "hello\n");
    await workGit.add("feature-file.txt");
    await workGit.commit("Add feature file");
    await workGit.push("origin", "feature/merge-test");
    await workGit.checkout("main");

    const result = await mergeBranch(
      TEST_REPO_PATH,
      "main",
      "feature/merge-test",
      "Merge pull request from feature/merge-test into main",
      "merge"
    );
    expect(result.success).toBe(true);

    const squash = await mergeBranch(
      TEST_REPO_PATH,
      "main",
      "feature/merge-test",
      "Squash pull request from feature/merge-test into main",
      "squash"
    );
    expect(squash.success).toBe(true);

    const rebase = await mergeBranch(
      TEST_REPO_PATH,
      "main",
      "feature/merge-test",
      "Rebase pull request from feature/merge-test into main",
      "rebase"
    );
    expect(rebase.success).toBe(true);

    await fs.rm(tmp, { recursive: true, force: true });
  });
});
