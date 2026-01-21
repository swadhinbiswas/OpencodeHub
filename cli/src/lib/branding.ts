/**
 * CLI Branding - ASCII Art & Colors
 */

import chalk from "chalk";
import figlet from "figlet";
import gradient from "gradient-string";

/**
 * OpenCodeHub ASCII Art Logo
 */
export function showLogo(): void {
    const logo = figlet.textSync("OpenCodeHub", {
        font: "Standard",
        horizontalLayout: "default",
        verticalLayout: "default",
    });

    console.log(gradient.pastel.multiline(logo));
    console.log(chalk.gray("  Stack-first PR workflows from your terminal\n"));
}

/**
 * Compact logo for operations
 */
export function showCompactLogo(): void {
    const logo = figlet.textSync("OCH", {
        font: "Small",
        horizontalLayout: "fitted",
    });
    console.log(gradient.cristal.multiline(logo));
}

/**
 * Success celebration ASCII art
 */
export function showSuccess(message: string): void {
    const art = `
    ✨ ${chalk.green.bold("SUCCESS!")} ✨
    
    ${chalk.green(message)}
    `;
    console.log(art);
}

/**
 * Color scheme
 */
export const colors = {
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.cyan,
    highlight: chalk.magenta,
    dim: chalk.gray,
    bold: chalk.bold,
};

/**
 * Styled console methods
 */
export const log = {
    success: (msg: string) => console.log(colors.success("✓"), msg),
    error: (msg: string) => console.log(colors.error("✗"), msg),
    warning: (msg: string) => console.log(colors.warning("⚠"), msg),
    info: (msg: string) => console.log(colors.info("ℹ"), msg),
    step: (msg: string) => console.log(colors.highlight("→"), msg),
    dim: (msg: string) => console.log(colors.dim(msg)),
};
