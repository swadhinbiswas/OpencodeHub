#!/usr/bin/env node
/**
 * OpenCodeHub CLI
 * Stack-first PR workflow tool
 */

import { Command } from "commander";
import chalk from "chalk";
import { stackCommands } from "../src/commands/stack/index.js";
import { authCommands } from "../src/commands/auth.js";

const program = new Command();

program
    .name("och")
    .description("OpenCodeHub CLI - Stack-first PR workflows")
    .version("1.0.0");

// Auth commands
program
    .command("auth")
    .description("Authentication commands")
    .addCommand(authCommands);

// Stack commands
program
    .command("stack")
    .description("Manage stacked PRs")
    .addCommand(stackCommands);

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
