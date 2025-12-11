import { getCommits, initRepository } from "@/lib/git";
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
});
