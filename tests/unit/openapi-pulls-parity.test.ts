import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { openApiSpec } from "@/lib/openapi";

function collectRouteFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.endsWith(".ts")) {
        files.push(relative(root, fullPath).replaceAll("\\", "/"));
      }
    }
  }

  return files;
}

function toOpenApiPath(routeFile: string): string {
  const withoutTs = routeFile.replace(/\.ts$/, "");
  let relativePath = withoutTs;
  if (relativePath === "index") {
    return "/repos/{owner}/{repo}/pulls";
  }
  if (relativePath.endsWith("/index")) {
    relativePath = relativePath.slice(0, -"/index".length);
  }
  const normalized = relativePath.replace(/\[([^\]]+)\]/g, "{$1}");
  return `/repos/{owner}/{repo}/pulls/${normalized}`;
}

function canonicalizePath(path: string): string {
  return path.replace(/\{[^}]+\}/g, "{}");
}

describe("openapi pulls parity", () => {
  it("documents all implemented pulls routes", () => {
    const routeRoot = "src/pages/api/repos/[owner]/[repo]/pulls";
    const routeFiles = collectRouteFiles(routeRoot);
    const expectedPaths = routeFiles.map(toOpenApiPath).map(canonicalizePath);

    const openApiPaths = new Set(Object.keys(openApiSpec.paths).map(canonicalizePath));
    // Known missing from OpenAPI spec — documented routes that need spec entries
    const knownMissing = new Set([
      "/repos/{}/{}/pulls/reviewer-routing",
      "/repos/{}/{}/pulls/{}/diff",
      "/repos/{}/{}/pulls/bulk-queue-manage",
      "/repos/{}/{}/pulls/bulk-queue",
      "/repos/{}/{}/pulls/review-health",
    ]);

    const missing = expectedPaths.filter(
      (path) => !openApiPaths.has(path) && !knownMissing.has(path),
    );

    expect(missing).toEqual([]);
  });
});
