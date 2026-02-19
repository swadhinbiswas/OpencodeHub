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
  if (withoutTs === "index") {
    return "/repos/{owner}/{repo}/pulls/{number}";
  }
  const normalized = withoutTs.replace(/\[([^\]]+)\]/g, "{$1}");
  return `/repos/{owner}/{repo}/pulls/{number}/${normalized}`;
}

describe("openapi pulls[number] parity", () => {
  it("documents all implemented pull-number routes", () => {
    const routeRoot = "src/pages/api/repos/[owner]/[repo]/pulls/[number]";
    const routeFiles = collectRouteFiles(routeRoot);
    const expectedPaths = routeFiles.map(toOpenApiPath);

    const openApiPaths = new Set(Object.keys(openApiSpec.paths));
    const missing = expectedPaths.filter((path) => !openApiPaths.has(path));

    expect(missing).toEqual([]);
  });
});
