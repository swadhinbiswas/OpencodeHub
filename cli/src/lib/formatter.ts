/**
 * Message Formatter - Boxed messages and tables
 * Uses Dracula Theme for cohesive CLI branding
 */

import boxen from "boxen";
import chalk from "chalk";

type PanelTone =
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "accent";

interface PanelOptions {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  lines?: string[];
  footer?: string;
  tone?: PanelTone;
}

interface MetricItem {
  label: string;
  value: string | number;
  tone?: Exclude<PanelTone, "neutral"> | "neutral" | "muted";
}

// Dracula Color Palette
const colors = {
  background: "#282a36",
  currentLine: "#44475a",
  foreground: "#f8f8f2",
  comment: "#6272a4",
  cyan: "#8be9fd",
  green: "#50fa7b",
  orange: "#ffb86c",
  pink: "#ff79c6",
  purple: "#bd93f9",
  red: "#ff5555",
  yellow: "#f1fa8c",
};

const panelToneStyles: Record<
  PanelTone,
  { title: (value: string) => string; borderColor: string }
> = {
  neutral: { title: chalk.hex(colors.foreground).bold, borderColor: colors.comment },
  success: { title: chalk.hex(colors.green).bold, borderColor: colors.green },
  info: { title: chalk.hex(colors.cyan).bold, borderColor: colors.cyan },
  warning: { title: chalk.hex(colors.yellow).bold, borderColor: colors.yellow },
  danger: { title: chalk.hex(colors.red).bold, borderColor: colors.red },
  accent: { title: chalk.hex(colors.purple).bold, borderColor: colors.purple },
};

const badgeStyles = {
  neutral: chalk.bgHex(colors.currentLine).hex(colors.foreground),
  muted: chalk.bgHex(colors.background).hex(colors.comment),
  success: chalk.bgHex("#163A29").hex(colors.green), // dark green bg
  info: chalk.bgHex("#163A50").hex(colors.cyan), // dark cyan bg
  warning: chalk.bgHex("#4C4A26").hex(colors.yellow), // dark yellow bg
  danger: chalk.bgHex("#4C1626").hex(colors.red), // dark red bg
  accent: chalk.bgHex("#3A2A4C").hex(colors.purple), // dark purple bg
};

function buildBoxContent(title: string, content: string[], color: string) {
  return boxen(
    [title, "", ...content.map((line) => chalk.hex(colors.foreground)(line))].join("\n"),
    {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: color,
    },
  );
}

export function formatBadge(
  label: string,
  tone: keyof typeof badgeStyles = "neutral",
): string {
  return badgeStyles[tone](` ${label} `);
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function formatRelativeTime(input?: string | null): string {
  if (!input) return "unknown";

  const timestamp = new Date(input).getTime();
  if (Number.isNaN(timestamp)) return input;

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;

  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears}y ago`;
}

export function getPanelString({
  eyebrow,
  title,
  subtitle,
  lines = [],
  footer,
  tone = "neutral",
}: PanelOptions): string {
  const panelTone = panelToneStyles[tone];
  const body = [
    eyebrow ? chalk.hex(colors.comment).bold(eyebrow.toUpperCase()) : null,
    panelTone.title(title),
    subtitle ? chalk.hex(colors.comment)(subtitle) : null,
    lines.length > 0 ? "" : null,
    ...lines.map((line) => chalk.hex(colors.foreground)(line)),
    footer ? "" : null,
    footer ? chalk.hex(colors.comment)(footer) : null,
  ].filter(Boolean) as string[];

  return boxen(body.join("\n"), {
    padding: { top: 0, right: 1, bottom: 0, left: 1 },
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
    borderStyle: "round",
    borderColor: panelTone.borderColor,
  });
}

export function renderPanel(options: PanelOptions): void {
  console.log(getPanelString(options));
}

export function printSectionHeader(
  title: string,
  subtitle?: string,
  eyebrow?: string,
): void {
  const parts = [
    eyebrow ? chalk.hex(colors.comment).bold(eyebrow.toUpperCase()) : null,
    chalk.hex(colors.pink).bold(title),
    subtitle ? chalk.hex(colors.comment)(subtitle) : null,
  ].filter(Boolean);

  console.log(`\n${parts.join("\n")}`);
}

export function printMetricStrip(metrics: MetricItem[]): void {
  const rendered = metrics.map((metric) => {
    const tone = metric.tone || "neutral";
    return `${formatBadge(String(metric.value), tone === "muted" ? "muted" : tone)} ${chalk.hex(colors.comment)(metric.label)}`;
  });

  console.log(rendered.join(`  ${chalk.hex(colors.currentLine)("•")}  `));
}

/**
 * Create a success box
 */
export function successBox(title: string, content: string[]): void {
  console.log(buildBoxContent(chalk.hex(colors.green).bold(title), content, colors.green));
}

/**
 * Create an error box
 */
export function errorBox(title: string, content: string[]): void {
  console.log(buildBoxContent(chalk.hex(colors.red).bold(title), content, colors.red));
}

/**
 * Create an info box
 */
export function infoBox(title: string, content: string[]): void {
  console.log(buildBoxContent(chalk.hex(colors.cyan).bold(title), content, colors.cyan));
}

/**
 * Create a warning box
 */
export function warningBox(title: string, content: string[]): void {
  console.log(buildBoxContent(chalk.hex(colors.yellow).bold(title), content, colors.yellow));
}
