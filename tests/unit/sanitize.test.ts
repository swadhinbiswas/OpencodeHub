import { escapeHtml, sanitizeHtml } from "@/lib/sanitize";
import { describe, expect, it } from "vitest";

describe("sanitizeHtml", () => {
  it("removes script tags", () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).not.toContain(
      "<script",
    );
  });

  it("removes script tags with attributes", () => {
    expect(sanitizeHtml('<script src="evil.js"></script>')).not.toContain(
      "<script",
    );
  });

  it("removes event handler attributes", () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)" />');
    expect(result).not.toContain("onerror");
  });

  it("removes onclick handlers", () => {
    const result = sanitizeHtml('<button onclick="steal()">Click</button>');
    expect(result).not.toContain("onclick");
  });

  it("removes javascript: URIs", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain("javascript:");
  });

  it("removes iframe tags", () => {
    const result = sanitizeHtml('<iframe src="http://evil.com"></iframe>');
    expect(result).not.toContain("<iframe");
  });

  it("removes object tags", () => {
    const result = sanitizeHtml('<object data="malware.swf"></object>');
    expect(result).not.toContain("<object");
  });

  it("removes embed tags", () => {
    const result = sanitizeHtml('<embed src="malware.swf" />');
    expect(result).not.toContain("<embed");
  });

  it("removes form tags", () => {
    const result = sanitizeHtml(
      '<form action="http://evil.com"><input /></form>',
    );
    expect(result).not.toContain("<form");
  });

  it("allows safe tags", () => {
    const safe = "<p>Hello <strong>world</strong></p>";
    const result = sanitizeHtml(safe);
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
  });

  it("handles empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("handles plain text", () => {
    expect(sanitizeHtml("Hello world")).toBe("Hello world");
  });

  it("handles nested malicious tags", () => {
    const result = sanitizeHtml(
      "<div><script><script>alert(1)</script></script></div>",
    );
    expect(result).not.toContain("<script");
  });
});

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes less-than", () => {
    expect(escapeHtml("a < b")).toBe("a &lt; b");
  });

  it("escapes greater-than", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    const result = escapeHtml("it's");
    expect(result).toContain("&#");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles already safe text", () => {
    expect(escapeHtml("Hello world")).toBe("Hello world");
  });

  it("escapes all special chars combined", () => {
    const result = escapeHtml("<script>\"alert('xss')&</script>");
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).toContain("&amp;");
  });
});
