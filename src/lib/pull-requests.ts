import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { evaluateGates } from "./ci-gates";
import { mergeBranch } from "./git";
import { resolveRepoPath } from "./git-storage";
import { closeLinkedIssuesOnMerge } from "./pr-issue-linking";

export async function mergePullRequest(
  pullRequestId: string,
  mergedById: string,
  mergeMethod: "merge" | "squash" | "rebase" = "merge",
) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const pr = await db.query.pullRequests.findFirst({
    where: eq(schema.pullRequests.id, pullRequestId),
  });

  if (!pr) {
    throw new Error("Pull request not found");
  }

  if (pr.state !== "open") {
    throw new Error("Pull request is not open");
  }

  const gateResult = await evaluateGates(pr.id);
  if (!gateResult.canMerge) {
    const failed = gateResult.results
      .filter((result) => !result.passed)
      .map((result) => result.message)
      .join("; ");
    throw new Error(`Merge blocked: ${failed}`);
  }

  const repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.id, pr.repositoryId),
  });

  if (!repo) {
    throw new Error("Repository not found");
  }

  const repoPath = await resolveRepoPath(repo.diskPath);
  const commitTitle = `Merge pull request #${pr.number} from ${pr.headBranch}`;
  const mergeResult = await mergeBranch(
    repoPath,
    pr.baseBranch,
    pr.headBranch,
    commitTitle,
  );

  if (!mergeResult.success) {
    throw new Error(mergeResult.message || "Merge failed");
  }

  const now = new Date();
  await db
    .update(schema.pullRequests)
    .set({
      state: "merged",
      isMerged: true,
      mergedAt: now,
      mergedById,
      mergeCommitSha: mergeResult.sha || null,
      mergeSha: mergeResult.sha || null,
      mergeMethod,
      updatedAt: now,
    })
    .where(eq(schema.pullRequests.id, pullRequestId));

  await closeLinkedIssuesOnMerge(pr.id, mergedById);

  return db.query.pullRequests.findFirst({
    where: eq(schema.pullRequests.id, pullRequestId),
  });
}
