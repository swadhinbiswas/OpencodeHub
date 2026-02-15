
import { simpleGit, SimpleGit } from "simple-git";
import { acquireRepo, releaseRepo } from "./git-storage";
import { logger } from "./logger";

export type RewriteOperation =
    | { type: "pick"; hash: string }
    | { type: "reword"; hash: string; newMessage: string }
    | { type: "squash"; hash: string } // Squash this into previous
    | { type: "drop"; hash: string };

export async function rewriteBranchHistory(
    repoOwner: string,
    repoName: string,
    baseBranch: string,
    headBranch: string,
    operations: RewriteOperation[]
): Promise<void> {
    const repoPath = await acquireRepo(repoOwner, repoName);
    const git = simpleGit(repoPath);

    try {
        await git.fetch();

        // 1. Reset to base
        // Create a temp branch to do the work
        const tempBranch = `rewrite-${Date.now()}`;
        await git.checkout(baseBranch);
        await git.pull();
        await git.checkoutLocalBranch(tempBranch);

        // 2. Perform operations
        // We iterate through operations.
        // For squash, we need to handle "squash into previous".
        // The operations list should be in the Desired Order.

        // Example: [pick A, squash B, pick C] -> Result: A+B, C.

        let previousCommitWasSquash = false;

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];

            if (op.type === "drop") continue;

            try {
                if (op.type === "pick") {
                    // git cherry-pick <hash>
                    await git.raw(["cherry-pick", op.hash]);
                    previousCommitWasSquash = false;
                }
                else if (op.type === "reword") {
                    await git.raw(["cherry-pick", op.hash]);
                    await git.commit(op.newMessage, { "--amend": null });
                    previousCommitWasSquash = false;
                }
                else if (op.type === "squash") {
                    // Squash: cherry-pick -n, then commit --amend (to previous)
                    // If first commit is squash, it fails (cannot squash into nothing).
                    // We assume valid input from UI.

                    // 1. Apply changes without commit
                    // cherry-pick -n <hash>
                    await git.raw(["cherry-pick", "-n", op.hash]);

                    // 2. Amend previous commit
                    // This reuses previous message + new message?
                    // simple 'git commit --amend --no-edit' keeps old message.
                    // Let's just append for now or keep old.
                    // Ideally we concatenate messages.

                    // Only getting subject here, bodies are harder without parsing.
                    // MVP: Keep previous message (fixup behavior) or just generic amend
                    await git.commit("", { "--amend": null, "--no-edit": null });

                    previousCommitWasSquash = true;
                }
            } catch (e: any) {
                if (e.message.includes("conflict")) {
                    await git.raw(["cherry-pick", "--abort"]).catch(() => { });
                    throw new Error(`Conflict while processing commit ${op.hash}. Rewriting aborted.`);
                }
                throw e;
            }
        }

        // 3. Force push to head branch
        // Push tempBranch to origin/headBranch
        await git.push("origin", `${tempBranch}:${headBranch}`, { "--force": null });

        // Clean up
        await git.checkout(baseBranch);
        await git.deleteLocalBranch(tempBranch, true);

    } finally {
        await releaseRepo(repoOwner, repoName, true); // True because we pushed
    }
}
