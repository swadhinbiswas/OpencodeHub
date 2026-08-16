/**
 * Contract: OpenAPI specification shape
 *
 * Guards `src/lib/openapi.ts` — the machine-readable API contract that
 * clients (SDK, docs site, tooling) are generated from.
 */
import { describe, expect, it } from "vitest";
import { openApiSpec } from "@/lib/openapi";

describe("OpenAPI spec contract", () => {
  it("is a valid OpenAPI 3.0 document", () => {
    expect(openApiSpec.openapi).toBe("3.0.0");
    expect(openApiSpec.info?.version).toBeTruthy();
    expect(openApiSpec.info?.title).toBeTruthy();
    expect(openApiSpec.paths).toBeTruthy();
  });

  it("declares the bearer security scheme", () => {
    const schemes = (openApiSpec as any).components?.securitySchemes ?? {};
    expect(schemes.bearerAuth).toBeTruthy();
    expect(schemes.bearerAuth.type).toBe("http");
  });

  it("documents every core PR lifecycle path", () => {
    const paths = openApiSpec.paths ?? {};
    for (const p of [
      "/repos/{owner}/{repo}/pulls",
      "/repos/{owner}/{repo}/pulls/{number}",
      "/repos/{owner}/{repo}/pulls/{number}/merge",
      "/repos/{owner}/{repo}/pulls/{number}/comments",
      "/repos/{owner}/{repo}/pulls/{number}/reviews",
      "/repos/{owner}/{repo}/pulls/{number}/checks",
      "/repos/{owner}/{repo}/pulls/{number}/auto-merge",
      "/repos/{owner}/{repo}/pulls/{number}/merge-readiness",
    ]) {
      expect(paths[p], `missing path ${p}`).toBeTruthy();
    }
  });

  it("documents core auth + repo + issue paths", () => {
    const paths = openApiSpec.paths ?? {};
    for (const p of [
      "/auth/me",
      "/repos",
      "/repos/{owner}/{repo}",
      "/repos/{owner}/{repo}/issues",
      "/repos/{owner}/{repo}/issues/{number}",
      "/repos/{owner}/{repo}/branches",
      "/repos/{owner}/{repo}/labels",
    ]) {
      expect(paths[p], `missing path ${p}`).toBeTruthy();
    }
  });

  it("paths use {param} braces and no square brackets", () => {
    const paths = Object.keys(openApiSpec.paths ?? {});
    for (const p of paths) {
      expect(p).not.toMatch(/\[/);
      expect(p).not.toMatch(/\]/);
      expect(p.startsWith("/")).toBe(true);
    }
  });

  it("every path has at least one operation with responses", () => {
    const paths = openApiSpec.paths ?? {};
    for (const [p, ops] of Object.entries(paths) as any) {
      const methods = ["get", "post", "put", "patch", "delete"].filter(
        (m) => ops?.[m],
      );
      expect(methods.length, `path ${p} has no operations`).toBeGreaterThan(0);
      for (const m of methods) {
        expect(ops[m].responses, `${m.toUpperCase()} ${p} missing responses`)
          .toBeTruthy();
      }
    }
  });
});
