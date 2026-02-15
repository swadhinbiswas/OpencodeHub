
import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import inquirer from 'inquirer';
import chalk from 'chalk';

export const runnerConfigCommand = new Command('config')
    .description('Configure a self-hosted runner interactively')
    .option('-t, --token <token>', 'Runner registration token')
    .option('-u, --url <url>', 'OpenCodeHub API URL')
    .action(async (options) => {
        console.log(chalk.bold.blue('OpenCodeHub Runner Configuration'));
        console.log('Run this command in the directory where you want to run the runner.\n');

        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'url',
                message: 'OpenCodeHub API URL:',
                default: options.url || 'http://localhost:3000',
                validate: (input) => input.startsWith('http') ? true : 'Must be a valid URL'
            },
            {
                type: 'password',
                name: 'token',
                message: 'Registration Token:',
                default: options.token,
                validate: (input) => input ? true : 'Token is required'
            },
            {
                type: 'input',
                name: 'name',
                message: 'Runner Name:',
                default: `runner-${Math.random().toString(36).substring(7)}`
            }
        ]);

        const envContent = `
# OpenCodeHub Runner Configuration
API_URL=${answers.url}
RUNNER_TOKEN=${answers.token}
RUNNER_NAME=${answers.name}
`.trim();

        const envPath = path.join(process.cwd(), '.env.runner'); // Use distinct file or .env
        // Check if .env exists, maybe append? For safety, let's write to .env.runner and instruct user.

        // Actually, let's just write to .env so `bun run runner:start` picks it up automatically if in proper dir,
        // or strictly for the runner execution context.
        // Assuming user runs this in the runner source dir or deployment dir.

        await fs.writeFile('.env', envContent);

        console.log(chalk.green('\n✓ Configuration saved to .env'));
        console.log('\nYou can now start the runner with:');
        console.log(chalk.cyan('bun run runner:start'));
    });
