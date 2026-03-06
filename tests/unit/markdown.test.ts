import { renderMarkdown } from "@/lib/markdown";
import { describe, expect, it } from "vitest";

describe("renderMarkdown", () => {
  it("renders simple text", async () => {
    const html = await renderMarkdown("Hello world");
    expect(html).toContain("Hello world");
  });

  it("renders headings", async () => {
    const html = await renderMarkdown("# Title\n## Subtitle");
    expect(html).toContain("<h1");
    expect(html).toContain("Title");
    expect(html).toContain("<h2");
    expect(html).toContain("Subtitle");
  });

  it("renders bold and italic", async () => {
    const html = await renderMarkdown("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders links", async () => {
    const html = await renderMarkdown("[OpenCodeHub](https://example.com)");
    expect(html).toContain("<a");
    expect(html).toContain("https://example.com");
  });

  it("renders code blocks", async () => {
    const html = await renderMarkdown("```js\nconst x = 1;\n```");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  it("renders inline code", async () => {
    const html = await renderMarkdown("Use `npm install` to install");
    expect(html).toContain("<code");
    expect(html).toContain("npm install");
  });

  it("renders unordered lists", async () => {
    const html = await renderMarkdown("- Item 1\n- Item 2\n- Item 3");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("Item 1");
  });

  it("renders ordered lists", async () => {
    const html = await renderMarkdown("1. First\n2. Second");
    expect(html).toContain("<ol");
    expect(html).toContain("First");
  });

  it("renders GFM tables", async () => {
    const md = `
| Column A | Column B |
|----------|----------|
| Val 1    | Val 2    |
    `.trim();
    const html = await renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain("Column A");
    expect(html).toContain("Val 1");
  });

  it("renders GFM task lists", async () => {
    const md = "- [x] Done\n- [ ] Todo";
    const html = await renderMarkdown(md);
    expect(html).toContain("Done");
    expect(html).toContain("Todo");
  });

  it("renders GFM strikethrough", async () => {
    const html = await renderMarkdown("~~deleted~~");
    expect(html).toContain("<del");
    expect(html).toContain("deleted");
  });

  it("sanitizes dangerous html", async () => {
    const html = await renderMarkdown('<script>alert("xss")</script>');
    expect(html).not.toContain("<script");
  });

  it("removes dangerous attributes", async () => {
    const html = await renderMarkdown('<img onerror="alert(1)" src="x">');
    expect(html).not.toContain("onerror");
  });

  it("handles empty string", async () => {
    const html = await renderMarkdown("");
    expect(typeof html).toBe("string");
  });

  it("handles whitespace-only content", async () => {
    const html = await renderMarkdown("   \n\n   ");
    expect(typeof html).toBe("string");
  });

  it("renders cross-repo issue references", async () => {
    const html = await renderMarkdown("See owner/repo#123 for details");
    // The remarkCrossRepoLinks plugin should convert owner/repo#123 to a link
    expect(html).toContain("owner/repo#123");
  });

  it("renders blockquotes", async () => {
    const html = await renderMarkdown("> This is a quote");
    expect(html).toContain("<blockquote");
    expect(html).toContain("This is a quote");
  });

  it("renders horizontal rules", async () => {
    const html = await renderMarkdown("---");
    expect(html).toContain("<hr");
  });

  it("renders images", async () => {
    const html = await renderMarkdown(
      "![alt text](https://example.com/img.png)",
    );
    expect(html).toContain("<img");
    expect(html).toContain("alt text");
  });
});
