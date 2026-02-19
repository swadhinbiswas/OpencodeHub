import { describe, expect, it } from "vitest";
import { openApiSpec } from "@/lib/openapi";

describe("openapi route parity", () => {
  it("includes key pull request lifecycle and integration routes", () => {
    const paths = openApiSpec.paths as Record<string, unknown>;

    expect(paths["/repos/{owner}/{repo}/pulls"]).toBeTruthy();
    expect(paths["/repos/{owner}/{repo}/pulls/templates"]).toBeTruthy();
    expect(paths["/repos/{owner}/{repo}/pulls/{number}/ai-review"]).toBeTruthy();
    expect(paths["/repos/{owner}/{repo}/pulls/{number}"]).toBeTruthy();
    expect(paths["/repos/{owner}/{repo}/pulls/{number}/merge"]).toBeTruthy();
    expect(paths["/repos/{owner}/{repo}/pulls/{number}/impact"]).toBeTruthy();
    expect(paths["/repos/{owner}/{repo}/pulls/{number}/rewrite"]).toBeTruthy();
    expect(paths["/repos/{owner}/{repo}/pulls/{number}/issue-links"]).toBeTruthy();
    expect(paths["/repos/{owner}/{repo}/pulls/{number}/issue-links/{id}"]).toBeTruthy();
    expect(paths["/repos/{owner}/{repo}/pulls/{number}/file-approvals"]).toBeTruthy();
    expect(paths["/repos/{owner}/{repo}/pulls/{number}/file-approvals/{id}"]).toBeTruthy();
  });
});
