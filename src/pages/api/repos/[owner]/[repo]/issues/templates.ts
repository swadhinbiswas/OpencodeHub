import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { resolveRepoPath } from "@/lib/git-storage";
import { getFileContent } from "@/lib/git";
import { canReadRepo } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { notFound, success } from "@/lib/api";
import { parse as parseYaml } from "yaml";

interface IssueTemplate {
  name: string;
  about?: string;
  labels?: string[];
  assignees?: string[];
  title?: string;
  body: IssueTemplateElement[];
  path: string;
}

interface IssueTemplateElement {
  type: "markdown" | "input" | "textarea" | "dropdown" | "checkboxes";
  id?: string;
  attributes: {
    label?: string;
    description?: string;
    placeholder?: string;
    value?: string;
    options?: string[];
    required?: boolean;
  };
}

/**
 * Parse a GitHub-compatible issue template file (YAML or legacy markdown).
 */
function parseTemplate(content: string, path: string): IssueTemplate | null {
  // Legacy markdown template: frontmatter is not valid YAML with body sections
  if (path.endsWith(".md") && !content.includes("body:")) {
    return {
      name: "Blank issue template",
      body: [{ type: "textarea", attributes: { label: "Description", required: true } }],
      path,
    };
  }

  try {
    const raw = parseYaml(content) as any;
    if (!raw || typeof raw !== "object") return null;

    const body: IssueTemplateElement[] = Array.isArray(raw.body)
      ? raw.body.map((el: any) => ({
          type: el.type || "input",
          id: el.id,
          attributes: el.attributes || {},
        }))
      : [];

    return {
      name: raw.name || path,
      about: raw.about,
      labels: raw.labels,
      assignees: raw.assignees,
      title: raw.title,
      body: body.length > 0 ? body : [{ type: "textarea", attributes: { label: "Description", required: true } }],
      path,
    };
  } catch {
    return null;
  }
}

export const GET: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
  const { owner: ownerName, repo: repoName } = params;
  const url = new URL(request.url);
  const branch = url.searchParams.get("branch");
  const templatePath = url.searchParams.get("path");

  if (!ownerName || !repoName) return notFound("Repository not found");

  const db = getDatabase();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!user) return notFound("Repository not found");

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, user.id),
      eq(schema.repositories.name, repoName),
    ),
  });
  if (!repo) return notFound("Repository not found");

  if (!(await canReadRepo(locals.user?.id, repo, { isAdmin: locals.user?.isAdmin }))) {
    return notFound("Repository not found");
  }

  const repoPath = await resolveRepoPath(repo.diskPath);
  const targetBranch = branch || repo.defaultBranch;
  const git = (await import("@/lib/git")).getGit(repoPath);

  // ── Single template requested by path ────────────────────────────────
  if (templatePath) {
    const file = await getFileContent(repoPath, templatePath, targetBranch);
    if (!file || file.isBinary || !file.content) return notFound("Template not found");
    const template = parseTemplate(file.content, templatePath);
    return success({ template: template ? { ...template, content: file.content } : null });
  }

  // ── List templates from .github/ISSUE_TEMPLATE/ ──────────────────────
  const templates: Array<IssueTemplate & { content: string }> = [];
  try {
    const treeInfo = await git.raw([
      "ls-tree",
      "-r",
      "--name-only",
      targetBranch,
      ".github/ISSUE_TEMPLATE",
    ]);
    const files = treeInfo
      .split("\n")
      .filter((f) => /\.(yml|yaml|md)$/.test(f))
      .sort();

    for (const file of files) {
      // Skip the config file
      if (file.endsWith("config.yml") || file.endsWith("config.yaml")) continue;
      const result = await getFileContent(repoPath, file, targetBranch);
      if (!result || result.isBinary || !result.content) continue;
      const template = parseTemplate(result.content, file);
      if (template) templates.push({ ...template, content: result.content });
    }
  } catch {
    // No ISSUE_TEMPLATE directory
  }

  // ── Fallback: single template files (issue_template.md etc.) ─────────
  if (templates.length === 0) {
    const candidates = [
      ".github/issue_template.md",
      ".github/ISSUE_TEMPLATE.md",
      "docs/issue_template.md",
      "issue_template.md",
      ".github/issue_template.txt",
      "issue_template.txt",
    ];
    for (const path of candidates) {
      const file = await getFileContent(repoPath, path, targetBranch);
      if (file && !file.isBinary && file.content) {
        templates.push({
          name: path.split("/").pop()!.replace(/\.(md|txt)$/, ""),
          body: [{ type: "textarea", attributes: { label: "Description", required: true } }],
          path,
          content: file.content,
        });
        break;
      }
    }
  }

  return success({ templates });
});
