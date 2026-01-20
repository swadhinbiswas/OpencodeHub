/**
 * Search Commands
 * Search repositories, issues, and PRs from the CLI
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getConfig } from "../../lib/config.js";
import { getWithAuth } from "../../lib/api.js";

interface SearchResult<T> {
    total: number;
    items: T[];
}

interface RepoResult {
    id: string;
    fullName: string;
    description?: string;
    visibility: string;
    stars: number;
    forks: number;
    updatedAt: string;
}

interface IssueResult {
    id: string;
    number: number;
    title: string;
    state: string;
    repository: { fullName: string };
    author: { username: string };
    createdAt: string;
}

interface PRResult {
    id: string;
    number: number;
    title: string;
    state: string;
    repository: { fullName: string };
    author: { username: string };
    sourceBranch: string;
    targetBranch: string;
    createdAt: string;
}

export const searchCommands = new Command("search")
    .description("Search repositories, issues, and pull requests");

// Search Repos
searchCommands
    .command("repos <query>")
    .alias("repo")
    .description("Search repositories")
    .option("-L, --limit <n>", "Maximum results", "20")
    .option("--sort <field>", "Sort by (stars, forks, updated)", "stars")
    .option("--order <direction>", "Sort order (asc, desc)", "desc")
    .action(async (query: string, options) => {
        const config = getConfig();
        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        const spinner = ora(`Searching repositories for "${query}"...`).start();

        try {
            const params = new URLSearchParams();
            params.append("q", query);
            params.append("limit", options.limit);
            params.append("sort", options.sort);
            params.append("order", options.order);

            const result = await getWithAuth<{ data: SearchResult<RepoResult> }>(
                `/api/search/repos?${params}`
            );

            spinner.stop();

            if (result.data.items.length === 0) {
                console.log(chalk.dim(`No repositories found matching "${query}"`));
                return;
            }

            console.log(chalk.bold(`\n🔍 Repositories (${result.data.total} total, showing ${result.data.items.length})\n`));

            for (const repo of result.data.items) {
                const icon = repo.visibility === "private" ? chalk.yellow("🔒") : chalk.green("📦");
                console.log(`${icon} ${chalk.bold(repo.fullName)}`);
                if (repo.description) {
                    console.log(chalk.dim(`   ${repo.description.slice(0, 80)}${repo.description.length > 80 ? "..." : ""}`));
                }
                console.log(chalk.dim(`   ⭐ ${repo.stars}  🍴 ${repo.forks}  Updated ${new Date(repo.updatedAt).toLocaleDateString()}`));
            }

            console.log("");
        } catch (error) {
            spinner.fail("Search failed");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Search Issues
searchCommands
    .command("issues <query>")
    .alias("issue")
    .description("Search issues")
    .option("-L, --limit <n>", "Maximum results", "20")
    .option("-s, --state <state>", "Filter by state (open, closed, all)", "open")
    .option("-r, --repo <repo>", "Limit to specific repository (owner/name)")
    .action(async (query: string, options) => {
        const config = getConfig();
        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        const spinner = ora(`Searching issues for "${query}"...`).start();

        try {
            const params = new URLSearchParams();
            params.append("q", query);
            params.append("limit", options.limit);
            if (options.state !== "all") params.append("state", options.state);
            if (options.repo) params.append("repo", options.repo);

            const result = await getWithAuth<{ data: SearchResult<IssueResult> }>(
                `/api/search/issues?${params}`
            );

            spinner.stop();

            if (result.data.items.length === 0) {
                console.log(chalk.dim(`No issues found matching "${query}"`));
                return;
            }

            console.log(chalk.bold(`\n🔍 Issues (${result.data.total} total, showing ${result.data.items.length})\n`));

            for (const issue of result.data.items) {
                const icon = issue.state === "open" ? chalk.green("●") : chalk.red("●");
                console.log(`${icon} ${chalk.cyan(issue.repository.fullName)}#${issue.number} ${issue.title}`);
                console.log(chalk.dim(`   @${issue.author.username} • ${new Date(issue.createdAt).toLocaleDateString()}`));
            }

            console.log("");
        } catch (error) {
            spinner.fail("Search failed");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Search PRs
searchCommands
    .command("prs <query>")
    .alias("pr")
    .description("Search pull requests")
    .option("-L, --limit <n>", "Maximum results", "20")
    .option("-s, --state <state>", "Filter by state (open, closed, merged, all)", "open")
    .option("-r, --repo <repo>", "Limit to specific repository (owner/name)")
    .action(async (query: string, options) => {
        const config = getConfig();
        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        const spinner = ora(`Searching pull requests for "${query}"...`).start();

        try {
            const params = new URLSearchParams();
            params.append("q", query);
            params.append("limit", options.limit);
            if (options.state !== "all") params.append("state", options.state);
            if (options.repo) params.append("repo", options.repo);

            const result = await getWithAuth<{ data: SearchResult<PRResult> }>(
                `/api/search/prs?${params}`
            );

            spinner.stop();

            if (result.data.items.length === 0) {
                console.log(chalk.dim(`No pull requests found matching "${query}"`));
                return;
            }

            console.log(chalk.bold(`\n🔍 Pull Requests (${result.data.total} total, showing ${result.data.items.length})\n`));

            for (const pr of result.data.items) {
                const icon = pr.state === "open" ? chalk.green("●") :
                    pr.state === "merged" ? chalk.magenta("●") : chalk.red("●");
                console.log(`${icon} ${chalk.cyan(pr.repository.fullName)}#${pr.number} ${pr.title}`);
                console.log(chalk.dim(`   ${pr.sourceBranch} → ${pr.targetBranch} • @${pr.author.username}`));
            }

            console.log("");
        } catch (error) {
            spinner.fail("Search failed");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Search Code (bonus)
searchCommands
    .command("code <query>")
    .description("Search code")
    .option("-L, --limit <n>", "Maximum results", "20")
    .option("-r, --repo <repo>", "Limit to specific repository (owner/name)")
    .option("-l, --language <lang>", "Filter by language")
    .action(async (query: string, options) => {
        const config = getConfig();
        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        const spinner = ora(`Searching code for "${query}"...`).start();

        try {
            const params = new URLSearchParams();
            params.append("q", query);
            params.append("limit", options.limit);
            if (options.repo) params.append("repo", options.repo);
            if (options.language) params.append("language", options.language);

            const result = await getWithAuth<{
                data: SearchResult<{
                    path: string;
                    repository: { fullName: string };
                    matches: { line: number; content: string }[];
                }>
            }>(`/api/search/code?${params}`);

            spinner.stop();

            if (result.data.items.length === 0) {
                console.log(chalk.dim(`No code found matching "${query}"`));
                return;
            }

            console.log(chalk.bold(`\n🔍 Code (${result.data.total} total, showing ${result.data.items.length})\n`));

            for (const item of result.data.items) {
                console.log(`${chalk.cyan(item.repository.fullName)}/${chalk.bold(item.path)}`);
                for (const match of item.matches.slice(0, 3)) {
                    console.log(chalk.dim(`   ${match.line}: `) + match.content.trim());
                }
                console.log("");
            }
        } catch (error) {
            spinner.fail("Search failed");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

export default searchCommands;
