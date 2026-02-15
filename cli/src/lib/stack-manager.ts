
import { SimpleGit } from "simple-git";
import chalk from "chalk";

export interface StackNode {
    branch: string;
    parent: string | null;
    children: StackNode[];
    isCurrent: boolean;
}

export const PARENT_CONFIG_KEY = "och.parent";

/**
 * Set the parent branch for stack tracking
 */
export async function setParentBranch(git: SimpleGit, branch: string, parent: string) {
    await git.raw(["config", `branch.${branch}.${PARENT_CONFIG_KEY}`, parent]);
}

/**
 * Get the explicitly configured parent for a branch
 */
export async function getParentBranch(git: SimpleGit, branch: string): Promise<string | null> {
    try {
        const parent = await git.raw(["config", `branch.${branch}.${PARENT_CONFIG_KEY}`]);
        return parent.trim();
    } catch {
        return null;
    }
}

/**
 * Build a tree of stack branches based on config
 */
export async function getStackTopology(git: SimpleGit): Promise<StackNode[]> {
    const branches = await git.branchLocal();
    const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

    const nodes: Map<string, StackNode> = new Map();
    const allBranches = branches.all;

    // Initialize nodes
    for (const branch of allBranches) {
        nodes.set(branch, {
            branch,
            parent: null,
            children: [],
            isCurrent: branch === currentBranch
        });
    }

    // Link parents
    for (const branch of allBranches) {
        const parent = await getParentBranch(git, branch);
        if (parent && nodes.has(parent)) {
            const node = nodes.get(branch)!;
            node.parent = parent;
            nodes.get(parent)!.children.push(node);
        }
    }

    // Find roots (branches with no tracked parent or parent not in map)
    // We assume 'main' or trunk is a root if it has children, or any branch that has children but no parent config.
    // Actually, we usually want to find the stack roots.
    // A stack root is a branch that:
    // 1. Is 'main' (or base)
    // 2. OR has no parent config

    const roots: StackNode[] = [];
    for (const node of nodes.values()) {
        if (!node.parent) {
            roots.push(node);
        }
    }

    return roots;
}

/**
 * Recursively rebase a branch and its children
 */
export async function recursiveRebase(
    git: SimpleGit,
    branch: string,
    newParentTip: string,
    dryRun = false
): Promise<void> {
    // 1. Rebase this branch
    console.log(chalk.dim(`Rebasing ${branch} onto ${newParentTip}...`));

    if (!dryRun) {
        // Checkout
        await git.checkout(branch);

        // We use --onto to transplant: git rebase --onto new_parent_tip old_parent_tip branch
        // But we need to know the OLD parent tip.
        // If we just track "parent branch name", we can use `git rebase parent_branch`.
        // Git rebase automatically finds the merge base.
        // If the parent branch was just updated (rebased itself), `git rebase parent` works recursively IF we do it in order.

        try {
            await git.rebase([newParentTip]);
        } catch (e) {
            throw new Error(`Conflict rebasing ${branch} onto ${newParentTip}. Resolve manually.`);
        }
    }

    // 2. Update children
    // To do this, we need the topology.
    // This function might need to be part of a larger loop or take the tree.
    // Let's assume the caller manages the order (topological sort).
}

/**
 * Get a flat list of branches in topological order (Parent -> Child -> Grandchild)
 */
export function flattenStack(nodes: StackNode[]): StackNode[] {
    const result: StackNode[] = [];

    function traverse(node: StackNode) {
        result.push(node);
        for (const child of node.children) {
            traverse(child);
        }
    }

    for (const node of nodes) {
        // Only traverse if it looks like a stack root or has children relevant to us
        // For simplicity, traverse all roots
        traverse(node);
    }

    return result;
}
