/**
 * Message Formatter - Boxed messages and tables
 */

import boxen from "boxen";
import chalk from "chalk";

/**
 * Create a success box
 */
export function successBox(title: string, content: string[]): void {
    const text = [
        chalk.green.bold(title),
        "",
        ...content.map(line => chalk.white(line)),
    ].join("\n");

    console.log(boxen(text, {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "green",
    }));
}

/**
 * Create an error box  
 */
export function errorBox(title: string, content: string[]): void {
    const text = [
        chalk.red.bold(title),
        "",
        ...content.map(line => chalk.white(line)),
    ].join("\n");

    console.log(boxen(text, {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "red",
    }));
}

/**
 * Create an info box
 */
export function infoBox(title: string, content: string[]): void {
    const text = [
        chalk.cyan.bold(title),
        "",
        ...content.map(line => chalk.white(line)),
    ].join("\n");

    console.log(boxen(text, {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "cyan",
    }));
}

/**
 * Create a warning box
 */
export function warningBox(title: string, content: string[]): void {
    const text = [
        chalk.yellow.bold(title),
        "",
        ...content.map(line => chalk.white(line)),
    ].join("\n");

    console.log(boxen(text, {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "yellow",
    }));
}
