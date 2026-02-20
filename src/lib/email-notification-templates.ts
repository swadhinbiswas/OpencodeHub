export type EmailTemplateId =
  | "test"
  | "digest_daily"
  | "digest_weekly"
  | "pr_opened"
  | "issue_opened";

export interface EmailTemplateDefinition {
  id: EmailTemplateId;
  name: string;
  description: string;
  subjectTemplate: string;
  htmlTemplate: string;
  requiredVariables: string[];
}

const TEMPLATE_DEFINITIONS: EmailTemplateDefinition[] = [
  {
    id: "test",
    name: "Delivery Test",
    description: "Basic test email for validating SMTP delivery path.",
    subjectTemplate: "OpenCodeHub email delivery test",
    htmlTemplate: "<h2>OpenCodeHub email delivery test</h2><p>This is a delivery test email.</p>",
    requiredVariables: [],
  },
  {
    id: "digest_daily",
    name: "Daily Digest",
    description: "Daily summary digest notification template.",
    subjectTemplate: "Your daily OpenCodeHub digest",
    htmlTemplate: "<h2>Daily digest</h2><p>You have {{count}} notifications today.</p>",
    requiredVariables: ["count"],
  },
  {
    id: "digest_weekly",
    name: "Weekly Digest",
    description: "Weekly summary digest notification template.",
    subjectTemplate: "Your weekly OpenCodeHub digest",
    htmlTemplate: "<h2>Weekly digest</h2><p>You have {{count}} notifications this week.</p>",
    requiredVariables: ["count"],
  },
  {
    id: "pr_opened",
    name: "Pull Request Opened",
    description: "Pull request opened event notification template.",
    subjectTemplate: "PR #{{number}} opened: {{title}}",
    htmlTemplate: "<h2>Pull request opened</h2><p><strong>{{author}}</strong> opened PR #{{number}}: {{title}}</p>",
    requiredVariables: ["number", "title", "author"],
  },
  {
    id: "issue_opened",
    name: "Issue Opened",
    description: "Issue opened event notification template.",
    subjectTemplate: "Issue #{{number}} opened: {{title}}",
    htmlTemplate: "<h2>Issue opened</h2><p><strong>{{author}}</strong> opened issue #{{number}}: {{title}}</p>",
    requiredVariables: ["number", "title", "author"],
  },
];

function applyVariables(template: string, variables: Record<string, string | number>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function listEmailTemplates(): EmailTemplateDefinition[] {
  return TEMPLATE_DEFINITIONS;
}

export function getEmailTemplate(templateId: EmailTemplateId): EmailTemplateDefinition | null {
  return TEMPLATE_DEFINITIONS.find((t) => t.id === templateId) || null;
}

export function renderEmailTemplate(templateId: EmailTemplateId, variables: Record<string, string | number>) {
  const template = getEmailTemplate(templateId);
  if (!template) return null;

  return {
    id: template.id,
    subject: applyVariables(template.subjectTemplate, variables),
    html: applyVariables(template.htmlTemplate, variables),
    missingVariables: template.requiredVariables.filter((name) => variables[name] === undefined),
  };
}
