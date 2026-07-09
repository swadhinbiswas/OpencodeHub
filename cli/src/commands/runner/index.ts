import { Command } from "commander";
import { runnerConfigCommand } from "./config.js";

export const runnerCommands = new Command("runner")
  .description("Manage OpenCodeHub CI runners");

runnerCommands.addCommand(runnerConfigCommand);
