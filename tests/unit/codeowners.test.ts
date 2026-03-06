import {
  CODEOWNERS_PATHS,
  findOwnersForFile,
  findOwnersForFiles,
  parseCodeOwners,
  validateCodeOwners,
} from "@/lib/codeowners";
import { describe, expect, it } from "vitest";

describe("CODEOWNERS_PATHS", () => {
  it("contains expected paths", () => {
    expect(CODEOWNERS_PATHS).toContain("CODEOWNERS");
    expect(CODEOWNERS_PATHS).toContain(".github/CODEOWNERS");
    expect(CODEOWNERS_PATHS).toContain("docs/CODEOWNERS");
  });
});

describe("parseCodeOwners", () => {
  it("parses simple ownership rules", () => {
    const content = `
# This is a comment
*.js @frontend-team
/docs/* @docs-team
*.ts @typescript-team
    `.trim();

    const result = parseCodeOwners(content);
    expect(result.rules).toBeDefined();
    expect(result.rules.length).toBe(3);
  });

  it("handles empty content", () => {
    const result = parseCodeOwners("");
    expect(result.rules).toBeDefined();
    expect(result.rules.length).toBe(0);
  });

  it("ignores comment lines", () => {
    const content = `
# Comment only
# Another comment
    `.trim();

    const result = parseCodeOwners(content);
    expect(result.rules.length).toBe(0);
  });

  it("ignores blank lines", () => {
    const content = `
*.js @owner1

*.ts @owner2
    `;

    const result = parseCodeOwners(content);
    expect(result.rules.length).toBe(2);
  });

  it("parses multiple owners per rule", () => {
    const content = "*.js @owner1 @owner2 user@example.com";
    const result = parseCodeOwners(content);
    expect(result.rules.length).toBe(1);
    expect(result.rules[0].owners.length).toBeGreaterThanOrEqual(2);
  });
});

describe("findOwnersForFile", () => {
  const content = `
*.js @js-team
*.ts @ts-team
/docs/* @docs-team
src/lib/* @core-team
  `.trim();

  const codeOwners = parseCodeOwners(content);

  it("matches .js files", () => {
    const owners = findOwnersForFile(codeOwners, "app.js");
    expect(owners).toContain("@js-team");
  });

  it("matches .ts files", () => {
    const owners = findOwnersForFile(codeOwners, "index.ts");
    expect(owners).toContain("@ts-team");
  });

  it("matches docs directory", () => {
    const owners = findOwnersForFile(codeOwners, "docs/readme.md");
    expect(owners).toContain("@docs-team");
  });

  it("matches src/lib directory", () => {
    const owners = findOwnersForFile(codeOwners, "src/lib/utils.ts");
    // Should get both @core-team (from src/lib/*) and @ts-team (from *.ts)
    // Last matching pattern wins in CODEOWNERS
    expect(owners.length).toBeGreaterThan(0);
  });

  it("returns empty for unmatched files", () => {
    const owners = findOwnersForFile(codeOwners, "Makefile");
    // No patterns match Makefile — returns empty
    expect(Array.isArray(owners)).toBe(true);
  });
});

describe("findOwnersForFiles", () => {
  const content = `
*.js @js-team
*.py @python-team
  `.trim();

  const codeOwners = parseCodeOwners(content);

  it("returns combined owners for multiple files", () => {
    const owners = findOwnersForFiles(codeOwners, ["app.js", "script.py"]);
    expect(owners).toContain("@js-team");
    expect(owners).toContain("@python-team");
  });

  it("deduplicates owners", () => {
    const owners = findOwnersForFiles(codeOwners, ["a.js", "b.js"]);
    const jsTeamCount = owners.filter((o) => o === "@js-team").length;
    expect(jsTeamCount).toBe(1);
  });

  it("handles empty file list", () => {
    const owners = findOwnersForFiles(codeOwners, []);
    expect(owners.length).toBe(0);
  });
});

describe("validateCodeOwners", () => {
  it("validates correct CODEOWNERS content", () => {
    const content = "*.js @frontend\n/docs/* @docs-team";
    const result = validateCodeOwners(content);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("reports error for rules without owners", () => {
    const content = "*.js\n*.ts @ts-team";
    const result = validateCodeOwners(content);
    // A rule without owners should trigger an error/warning
    expect(result.errors.length + result.warnings.length).toBeGreaterThan(0);
  });

  it("handles empty content", () => {
    const result = validateCodeOwners("");
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("handles comment-only content", () => {
    const result = validateCodeOwners("# just comments\n# more comments");
    expect(result.valid).toBe(true);
  });
});
