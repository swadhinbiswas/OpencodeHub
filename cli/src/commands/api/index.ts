/**
 * API Commands
 * Make direct API requests to OpenCodeHub
 */

import chalk from "chalk";
import { Command } from "commander";
import { applyTlsConfig } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";

export const apiCommands = new Command("api")
  .description("Make direct API requests")
  .argument("<endpoint>", "API endpoint (e.g., /user or repos/owner/name)")
  .option("-X, --method <method>", "HTTP method", "GET")
  .option(
    "-F, --field <field>",
    "Add field to request body (key=value)",
    (val, acc: string[]) => [...acc, val],
    [],
  )
  .option(
    "-f, --raw-field <field>",
    "Add raw field (no JSON parsing)",
    (val, acc: string[]) => [...acc, val],
    [],
  )
  .option(
    "-H, --header <header>",
    "Add header",
    (val, acc: string[]) => [...acc, val],
    [],
  )
  .option("--input <file>", "Read body from file")
  .option("-q, --quiet", "Only output response body")
  .option("--jq <query>", "Filter JSON output (basic support)")
  .option("-i, --include", "Include response headers")
  .action(async (endpoint: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    if (!config.serverUrl) {
      console.error(
        chalk.red(
          "Server URL not configured. Run 'och config set serverUrl <url>' or 'och auth login --url <url>'.",
        ),
      );
      process.exit(1);
    }

    try {
      // Normalize endpoint
      if (!endpoint.startsWith("/")) {
        endpoint = "/" + endpoint;
      }
      if (!endpoint.startsWith("/api")) {
        endpoint = "/api" + endpoint;
      }

      // Build headers
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      };

      for (const header of options.header) {
        const [key, ...valueParts] = header.split(":");
        headers[key.trim()] = valueParts.join(":").trim();
      }

      // Build body
      let body: any = undefined;

      if (options.input) {
        const fs = await import("fs");
        body = fs.readFileSync(options.input, "utf-8");
      } else if (options.field.length > 0 || options.rawField.length > 0) {
        body = {};
        for (const field of options.field) {
          const [key, ...valueParts] = field.split("=");
          const value = valueParts.join("=");
          // Try to parse as JSON
          try {
            body[key] = JSON.parse(value);
          } catch {
            body[key] = value;
          }
        }
        for (const field of options.rawField) {
          const [key, ...valueParts] = field.split("=");
          body[key] = valueParts.join("=");
        }
        body = JSON.stringify(body);
      }

      const url = `${config.serverUrl}${endpoint}`;

      if (!options.quiet) {
        console.error(chalk.dim(`${options.method} ${url}\n`));
      }

      applyTlsConfig();
      const response = await fetch(url, {
        method: options.method,
        headers,
        body,
      });

      // Output headers if requested
      if (options.include) {
        console.log(
          chalk.cyan(`HTTP/1.1 ${response.status} ${response.statusText}`),
        );
        response.headers.forEach((value, key) => {
          console.log(`${key}: ${value}`);
        });
        console.log("");
      }

      // Parse and output response
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await response.json();

        if (options.jq) {
          // Basic jq support
          const output = applyJqFilter(data, options.jq);
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
      } else {
        const text = await response.text();
        console.log(text);
      }

      if (!response.ok && !options.quiet) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("API request failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

/**
 * Basic jq-like filter support
 */
function applyJqFilter(data: any, query: string): any {
  if (query === ".") return data;

  const parts = query.split(".").filter(Boolean);
  let result = data;

  for (const part of parts) {
    // Handle array index
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      result = result[arrayMatch[1]][parseInt(arrayMatch[2])];
    }
    // Handle array access []
    else if (part === "[]") {
      // Already handled - just continue
    }
    // Handle property access
    else {
      if (Array.isArray(result)) {
        result = result.map((item) => item[part]);
      } else {
        result = result[part];
      }
    }

    if (result === undefined) break;
  }

  return result;
}

export default apiCommands;
