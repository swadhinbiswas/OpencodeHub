#!/usr/bin/env node
/**
 * OpenCodeHub CLI
 * Stack-first PR workflow tool with repo management
 */

import { Command } from "commander";
import chalk from "chalk";
import { stackCommands } from "../src/commands/stack/index.js";
import { authCommands } from "../src/commands/auth.js";
import { pushRepo, cloneRepo, createRepo, listRepos } from "../src/commands/repo.js";

const program = new Command();

program
    .name("och")
    .description("OpenCodeHub CLI - Git hosting and stack-first PR workflows")
    .version("1.0.0");

// Auth commands - authCommands is already named "auth"
program.addCommand(authCommands);

// Stack commands - stackCommands is already named "stack"  
program.addCommand(stackCommands);

// Repo commands
const repoCommand = program
    .command("repo")
    .description("Repository management");

repoCommand
    .command("push")
    .description("Push local repository to OpenCodeHub")
    .option("-b, --branch <branch>", "Branch to push")
    .option("-f, --force", "Force push (overwrite remote)")
    .action(async (options) => {
        await pushRepo(options);
    });

repoCommand
    .command("clone <repo>")
    .description("Clone a repository from OpenCodeHub")
    .argument("[destination]", "Local directory to clone into")
    .action(async (repo, destination) => {
        await cloneRepo(repo, destination);
    });

repoCommand
    .command("create <name>")
    .description("Create a new repository on OpenCodeHub")
    .option("-d, --description <desc>", "Repository description")
    .option("-p, --private", "Make repository private")
    .option("--no-init", "Don't initialize with README")
    .action(async (name, options) => {
        await createRepo({
            name,
            description: options.description,
            visibility: options.private ? "private" : "public",
            init: options.init,
        });
    });

repoCommand
    .command("list")
    .alias("ls")
    .description("List your repositories")
    .action(async () => {
        await listRepos();
    });

// Shorthand: och push (same as och repo push)
program
    .command("push")
    .description("Push to OpenCodeHub (shorthand for 'repo push')")
    .option("-b, --branch <branch>", "Branch to push")
    .option("-f, --force", "Force push")
    .action(async (options) => {
        await pushRepo(options);
    });

// Repo init
program
    .command("init")
    .description("Initialize repository for OpenCodeHub")
    .option("-u, --url <url>", "OpenCodeHub server URL")
    .action(async (options) => {
        console.log(chalk.blue("Initializing repository..."));
        console.log(`Server: ${options.url || "http://localhost:4321"}`);
        // TODO: Create .ochrc config
    });

// Sync command
program
    .command("sync")
    .description("Bidirectional sync with remote")
    .action(async () => {
        console.log(chalk.blue("Syncing with remote..."));
        // TODO: Implement sync
    });

// Status command
program
    .command("status")
    .alias("st")
    .description("Show current stack status")
    .action(async () => {
        console.log(chalk.blue("Stack Status"));
        console.log("─".repeat(40));
        // TODO: Show current stack
    });

program.parse(process.argv);

