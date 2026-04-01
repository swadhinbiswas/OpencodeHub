/**
 * Message Formatter - Boxed messages and tables
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

const panelToneStyles: Record<
  PanelTone,
  { title: (value: string) => string; borderColor: string }
> = {
  neutral: { title: chalk.whiteBright.bold, borderColor: "#334155" },
  success: { title: chalk.hex("#86efac").bold, borderColor: "#166534" },
  info: { title: chalk.hex("#7dd3fc").bold, borderColor: "#0369a1" },
  warning: { title: chalk.hex("#fde68a").bold, borderColor: "#b45309" },
  danger: { title: chalk.hex("#fca5a5").bold, borderColor: "#b91c1c" },
  accent: { title: chalk.hex("#c4b5fd").bold, borderColor: "#7c3aed" },
};

const badgeStyles = {
  neutral: chalk.bgHex("#111827").hex("#e5e7eb"),
  muted: chalk.bgHex("#1f2937").hex("#9ca3af"),
  success: chalk.bgHex("#052e16").hex("#86efac"),
  info: chalk.bgHex("#082f49").hex("#7dd3fc"),
  warning: chalk.bgHex("#451a03").hex("#fde68a"),
  danger: chalk.bgHex("#450a0a").hex("#fca5a5"),
  accent: chalk.bgHex("#2e1065").hex("#c4b5fd"),
};

function buildBoxContent(title: string, content: string[], color: string) {
  return boxen(
    [title, "", ...content.map((line) => chalk.white(line))].join("\n"),
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
    eyebrow ? chalk.hex("#94a3b8").bold(eyebrow.toUpperCase()) : null,
    panelTone.title(title),
    subtitle ? chalk.hex("#cbd5e1")(subtitle) : null,
    lines.length > 0 ? "" : null,
    ...lines.map((line) => chalk.white(line)),
    footer ? "" : null,
    footer ? chalk.hex("#94a3b8")(footer) : null,
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
    eyebrow ? chalk.hex("#94a3b8").bold(eyebrow.toUpperCase()) : null,
    chalk.hex("#f8fafc").bold(title),
    subtitle ? chalk.hex("#94a3b8")(subtitle) : null,
  ].filter(Boolean);

  console.log(`\n${parts.join("\n")}`);
}

export function printMetricStrip(metrics: MetricItem[]): void {
  const rendered = metrics.map((metric) => {
    const tone = metric.tone || "neutral";
    return `${formatBadge(String(metric.value), tone === "muted" ? "muted" : tone)} ${chalk.hex("#cbd5e1")(metric.label)}`;
  });

  console.log(rendered.join(`  ${chalk.hex("#475569")("•")}  `));
}

/**
 * Create a success box
 */
export function successBox(title: string, content: string[]): void {
  console.log(buildBoxContent(chalk.green.bold(title), content, "green"));
}

/**
 * Create an error box
 */
export function errorBox(title: string, content: string[]): void {
  console.log(buildBoxContent(chalk.red.bold(title), content, "red"));
}

/**
 * Create an info box
 */
export function infoBox(title: string, content: string[]): void {
  console.log(buildBoxContent(chalk.cyan.bold(title), content, "cyan"));
}

/**
 * Create a warning box
 */
export function warningBox(title: string, content: string[]): void {
  console.log(buildBoxContent(chalk.yellow.bold(title), content, "yellow"));
}
