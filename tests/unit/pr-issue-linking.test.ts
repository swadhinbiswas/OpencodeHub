import { describe, expect, it } from "vitest";
import { parseIssueReferences } from "@/lib/pr-issue-linking";

describe("parseIssueReferences", () => {
  it("parses basic closing and related references", () => {
    const refs = parseIssueReferences("Fixes #12 and also touches #20");
    expect(refs).toContainEqual({ number: 12, type: "fixes" });
    expect(refs).toContainEqual({ number: 20, type: "relates" });
  });

  it("parses scoped repository references for closing keywords", () => {
    const refs = parseIssueReferences("closes acme/platform#101");
    expect(refs).toContainEqual({ number: 101, type: "closes" });
  });

  it("does not downgrade closes/fixes to relates when both patterns match", () => {
    const refs = parseIssueReferences("Resolves #88 and #88 is part of rollout");
    const only = refs.filter((r) => r.number === 88);
    expect(only).toHaveLength(1);
    expect(only[0]).toEqual({ number: 88, type: "closes" });
  });

  it("supports multiple closing keywords in one body", () => {
    const refs = parseIssueReferences("Fixes #3, closes org/repo#4, and relates to #5");
    expect(refs).toContainEqual({ number: 3, type: "fixes" });
    expect(refs).toContainEqual({ number: 4, type: "closes" });
    expect(refs).toContainEqual({ number: 5, type: "relates" });
  });
});
