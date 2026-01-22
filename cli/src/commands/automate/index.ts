/**
 * Automate CLI Commands
 * Manage workflow automation rules
 */

import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import simpleGit from "simple-git";
import {
  deleteWithAuth,
  getWithAuth,
  patchWithAuth,
  postWithAuth,
} from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";
import { getRepoInfoFromGit } from "../../lib/git.js";

const git = simpleGit();

export const automateCommand = new Command("automate").description(
  "Manage workflow automation rules",
);

// Helper to get repo info
async function getRepoInfo() {
  const repoInfo = await getRepoInfoFromGit(git);
  return repoInfo ? { owner: repoInfo.owner, name: repoInfo.repo } : null;
}

// List automation rules
automateCommand
  .command("list")
  .description("List automation rules for current repository")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading automation rules...").start();

    try {
      const config = getConfig();
      if (!config.token) {
        spinner.fail("Not authenticated. Run 'och auth login' first.");
        process.exit(1);
      }

      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Not in a git repository with an origin remote");
        process.exit(1);
      }

      // Get repository ID first
      const repoRes = await getWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.name}`,
      );
      if (!repoRes.repository?.id) {
        spinner.fail("Repository not found on OpenCodeHub");
        process.exit(1);
      }

      const res = await getWithAuth(
        `/api/automation-rules?repositoryId=${repoRes.repository.id}`,
      );
      const rules = res.rules || [];

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(rules, null, 2));
        return;
      }

      if (rules.length === 0) {
        console.log(
          chalk.gray(
            "\n  ⚡ No automation rules. Create one with: och automate create\n",
          ),
        );
        return;
      }

      console.log(
        chalk.bold(
          `\n⚡ Automation Rules for ${repoInfo.owner}/${repoInfo.name}\n`,
        ),
      );

      const table = new Table({
        head: [
          chalk.gray("Name"),
          chalk.gray("Trigger"),
          chalk.gray("Status"),
          chalk.gray("Runs"),
        ],
      });

      for (const rule of rules) {
        table.push([
          rule.name,
          formatTrigger(rule.trigger),
          rule.isEnabled ? chalk.green("enabled") : chalk.gray("disabled"),
          String(rule.runCount || 0),
        ]);
      }

      console.log(table.toString());
      console.log();
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

// Create automation rule
automateCommand
  .command("create")
  .description("Create a new automation rule")
  .action(async () => {
    try {
      const config = getConfig();
      if (!config.token) {
        console.log(
          chalk.red("Not authenticated. Run 'och auth login' first."),
        );
        process.exit(1);
      }

      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        console.log(chalk.red("Not in a git repository"));
        process.exit(1);
      }

      // Get repository ID
      const repoRes = await getWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.name}`,
      );
      if (!repoRes.repository?.id) {
        console.log(chalk.red("Repository not found on OpenCodeHub"));
        process.exit(1);
      }

      console.log(
        chalk.bold(
          `\n⚡ Create Automation Rule for ${repoInfo.owner}/${repoInfo.name}\n`,
        ),
      );

      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "name",
          message: "Rule name:",
          validate: (input) => input.length > 0 || "Name required",
        },
        {
          type: "list",
          name: "trigger",
          message: "When should this run?",
          choices: [
            { name: "PR is opened", value: "pr_opened" },
            { name: "PR is approved", value: "pr_approved" },
            { name: "CI passes", value: "ci_passed" },
            { name: "CI fails", value: "ci_failed" },
            { name: "Label is added", value: "label_added" },
            { name: "Review is requested", value: "pr_review_requested" },
          ],
        },
        {
          type: "checkbox",
          name: "actions",
          message: "What actions to take?",
          choices: [
            { name: "Add label", value: "add_label" },
            { name: "Assign reviewer", value: "assign_reviewer" },
            { name: "Add to merge queue", value: "add_to_merge_queue" },
            { name: "Trigger AI review", value: "trigger_ai_review" },
            { name: "Add comment", value: "add_comment" },
          ],
          validate: (input) => input.length > 0 || "Select at least one action",
        },
      ]);

      // Build actions array with params
      const actions = [];
      for (const action of answers.actions) {
        const actionObj: any = { type: action, params: {} };

        if (action === "add_label") {
          const { label } = await inquirer.prompt([
            { type: "input", name: "label", message: "Label name:" },
          ]);
          actionObj.params.label = label;
        } else if (action === "assign_reviewer") {
          const { reviewer } = await inquirer.prompt([
            {
              type: "input",
              name: "reviewer",
              message: "Reviewer username (@codeowners for auto):",
            },
          ]);
          actionObj.params.assignee = reviewer;
        } else if (action === "add_comment") {
          const { comment } = await inquirer.prompt([
            { type: "input", name: "comment", message: "Comment text:" },
          ]);
          actionObj.params.body = comment;
        }

        actions.push(actionObj);
      }

      const spinner = ora("Creating rule...").start();

      await postWithAuth("/api/automation-rules", {
        repositoryId: repoRes.repository.id,
        name: answers.name,
        trigger: answers.trigger,
        actions: JSON.stringify(actions),
      });

      spinner.succeed(`Created automation: ${chalk.cyan(answers.name)}`);
    } catch (error: any) {
      console.error(chalk.red(`Failed: ${error.message}`));
    }
  });

// Enable/disable rule
automateCommand
  .command("enable <name>")
  .description("Enable an automation rule")
  .action(async (name) => {
    await toggleRule(name, true);
  });

automateCommand
  .command("disable <name>")
  .description("Disable an automation rule")
  .action(async (name) => {
    await toggleRule(name, false);
  });

async function toggleRule(name: string, enabled: boolean) {
  const spinner = ora(`${enabled ? "Enabling" : "Disabling"} rule...`).start();

  try {
    const repoInfo = await getRepoInfo();
    if (!repoInfo) {
      spinner.fail("Not in a git repository");
      return;
    }

    const repoRes = await getWithAuth(
      `/api/repos/${repoInfo.owner}/${repoInfo.name}`,
    );
    const res = await getWithAuth(
      `/api/automation-rules?repositoryId=${repoRes.repository?.id}`,
    );
    const rule = res.rules?.find((r: any) => r.name === name);

    if (!rule) {
      spinner.fail(`Rule "${name}" not found`);
      return;
    }

    await patchWithAuth(`/api/automation-rules?id=${rule.id}`, {
      isEnabled: enabled,
    });
    spinner.succeed(`${enabled ? "Enabled" : "Disabled"}: ${chalk.cyan(name)}`);
  } catch (error: any) {
    spinner.fail(`Failed: ${error.message}`);
  }
}

// Delete rule
automateCommand
  .command("delete <name>")
  .description("Delete an automation rule")
  .action(async (name) => {
    try {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Delete automation rule "${name}"?`,
          default: false,
        },
      ]);

      if (!confirm) return;

      const spinner = ora("Deleting rule...").start();

      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Not in a git repository");
        return;
      }

      const repoRes = await getWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.name}`,
      );
      const res = await getWithAuth(
        `/api/automation-rules?repositoryId=${repoRes.repository?.id}`,
      );
      const rule = res.rules?.find((r: any) => r.name === name);

      if (!rule) {
        spinner.fail(`Rule "${name}" not found`);
        return;
      }

      await deleteWithAuth(`/api/automation-rules?id=${rule.id}`);
      spinner.succeed(`Deleted: ${chalk.cyan(name)}`);
    } catch (error: any) {
      console.error(chalk.red(`Failed: ${error.message}`));
    }
  });

function formatTrigger(trigger: string): string {
  const labels: Record<string, string> = {
    pr_opened: "PR opened",
    pr_approved: "PR approved",
    pr_merged: "PR merged",
    ci_passed: "CI passes",
    ci_failed: "CI fails",
    label_added: "Label added",
    pr_review_requested: "Review requested",
  };
  return labels[trigger] || trigger;
}

export default automateCommand;
