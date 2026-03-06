import { parseSuggestionFromComment } from "@/lib/suggested-changes";
import { describe, expect, it } from "vitest";

describe("parseSuggestionFromComment", () => {
  it("extracts suggestion from a comment body", () => {
    const body = `
Some text before.

\`\`\`suggestion
const x = 42;
\`\`\`

Some text after.
    `.trim();

    const result = parseSuggestionFromComment(body);
    expect(result).toBeDefined();
    expect(result).toContain("const x = 42;");
  });

  it("returns null for comment without suggestion", () => {
    const body = "This is a regular comment without any suggestion block.";
    const result = parseSuggestionFromComment(body);
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSuggestionFromComment("")).toBeNull();
  });

  it("extracts multi-line suggestion", () => {
    const body = `
Review comment.

\`\`\`suggestion
function hello() {
  return "world";
}
\`\`\`
    `.trim();

    const result = parseSuggestionFromComment(body);
    expect(result).toBeDefined();
    expect(result).toContain("function hello()");
    expect(result).toContain('return "world"');
  });

  it("handles suggestion at start of body", () => {
    const body = `\`\`\`suggestion
fix this
\`\`\``;

    const result = parseSuggestionFromComment(body);
    expect(result).toBeDefined();
    expect(result).toContain("fix this");
  });

  it("does not confuse regular code blocks", () => {
    const body = `
\`\`\`javascript
const x = 1;
\`\`\`
    `.trim();

    const result = parseSuggestionFromComment(body);
    expect(result).toBeNull();
  });
});
