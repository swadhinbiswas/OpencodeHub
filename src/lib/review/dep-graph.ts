/**
 * Dependency Graph Engine
 * Builds import/dependency graphs from changed files.
 */

import type { DiffChunk } from "./diff-chunker";

export interface GraphNode {
  id: string;
  path: string;
  type: "file" | "module" | "route" | "component";
}

export interface GraphEdge {
  from: string;
  to: string;
  type: "import" | "require" | "route" | "component";
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  affectedRoutes: string[];
  affectedComponents: string[];
  circularDependencies: string[][];
}

// Import patterns for various languages
const IMPORT_PATTERNS: [RegExp, string][] = [
  // TypeScript/JavaScript
  [/import\s+.*from\s+['"]([^'"]+)['"]/g, "import"],
  [/import\s+['"]([^'"]+)['"]/g, "import"],
  [/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, "require"],
  // Dynamic imports
  [/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, "import"],
  // Go
  [/import\s+["']([^"']+)["']/g, "import"],
  // Python
  [/from\s+(\S+)\s+import/g, "import"],
  [/import\s+(\S+)/g, "import"],
  // Rust
  [/use\s+([\w:]+)::/g, "import"],
  // PHP
  [/use\s+([\w\\]+);/g, "import"],
  [/require_once\s+['"]([^'"]+)['"]/g, "require"],
  [/require\s+['"]([^'"]+)['"]/g, "require"],
];

function extractImports(content: string): string[] {
  const imports: string[] = [];

  for (const [pattern, _type] of IMPORT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const imp = match[1];
      // Filter out relative imports and non-path imports
      if (imp && !imp.startsWith(".") && !imp.startsWith("http") && !imp.includes("\0")) {
        imports.push(imp);
      }
    }
  }

  return [...new Set(imports)];
}

function resolveImportToPath(imp: string, currentFile: string): string | null {
  // Skip node_modules / bare specifiers
  if (!imp.startsWith(".") && !imp.startsWith("/")) return null;

  const currentDir = currentFile.split("/").slice(0, -1).join("/");
  let resolved = imp;

  if (imp.startsWith(".")) {
    resolved = currentDir ? `${currentDir}/${imp}` : imp;
  }

  // Normalize path
  const parts = resolved.split("/").filter(Boolean);
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === "..") normalized.pop();
    else if (part !== ".") normalized.push(part);
  }

  return normalized.join("/");
}

function detectRouteAndComponent(changedFiles: string[]): { routes: string[]; components: string[] } {
  const routes: string[] = [];
  const components: string[] = [];

  for (const file of changedFiles) {
    // Detect API routes
    if (/src\/pages\/api\//i.test(file)) {
      const route = file.replace(/.*src\/pages\/api\//, "/api/").replace(/\.(ts|js)$/, "").replace(/\/index$/, "");
      routes.push(route);
    }

    // Detect page routes
    if (/src\/pages\//i.test(file) && !/src\/pages\/api\//i.test(file)) {
      const route = file.replace(/.*src\/pages\//, "/").replace(/\.(astro|tsx|jsx)$/, "").replace(/\/index$/, "").replace(/\[([^\]]+)\]/g, ":$1");
      routes.push(route);
    }

    // Detect components
    if (/components?\//i.test(file) || /\.tsx$|\.vue$|\.svelte$/i.test(file)) {
      const name = file.split("/").pop()?.replace(/\.(tsx|jsx|vue|svelte|ts)$/, "") || file;
      components.push(name);
    }
  }

  return { routes: [...new Set(routes)], components: [...new Set(components)] };
}

function detectCircularDeps(edges: GraphEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string, path: string[]) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const neighbor of adj.get(node) || []) {
      dfs(neighbor, path);
    }

    path.pop();
    stack.delete(node);
  }

  for (const node of adj.keys()) {
    dfs(node, []);
  }

  return cycles;
}

export function buildDependencyGraph(chunks: DiffChunk[], _repoPath?: string): DependencyGraph {
  const changedFiles = chunks.map(c => c.filePath);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Create nodes for changed files
  for (const chunk of chunks) {
    const type = /components?\//i.test(chunk.filePath) ? "component"
      : /pages\/api\//i.test(chunk.filePath) ? "route"
      : /pages?\//i.test(chunk.filePath) ? "route"
      : "file";

    nodes.push({
      id: chunk.filePath,
      path: chunk.filePath,
      type: type as GraphNode["type"],
    });

    // Extract imports from diff content
    const imports = extractImports(chunk.content);
    for (const imp of imports) {
      const resolved = resolveImportToPath(imp, chunk.filePath);
      if (resolved) {
        edges.push({
          from: chunk.filePath,
          to: resolved,
          type: "import",
        });
      }
    }
  }

  // Detect routes and components
  const { routes, components } = detectRouteAndComponent(changedFiles);

  // Detect circular dependencies
  const circularDependencies = detectCircularDeps(edges);

  return {
    nodes,
    edges,
    affectedRoutes: routes,
    affectedComponents: components,
    circularDependencies,
  };
}
