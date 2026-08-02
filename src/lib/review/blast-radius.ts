/**
 * Blast Radius Calculator
 * Estimates the total system impact of a PR.
 */

import type { DiffChunk } from "./diff-chunker";
import type { DependencyGraph } from "./dep-graph";
import type { ArchImpact, ArchLayer } from "./arch-impact";

export interface BlastRadius {
  directChanges: number;
  transitiveChanges: number;
  affectedRoutes: number;
  affectedComponents: number;
  affectedLayers: ArchLayer[];
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
  breakdown: {
    filesChanged: number;
    routesAffected: number;
    componentsAffected: number;
    servicesAffected: number;
    databasesAffected: number;
  };
}

export function calculateBlastRadius(
  chunks: DiffChunk[],
  graph: DependencyGraph,
  archImpact: ArchImpact,
): BlastRadius {
  const directChanges = chunks.length;

  // Count transitive changes (files that import changed files)
  const changedSet = new Set(chunks.map(c => c.filePath));
  const transitiveSet = new Set<string>();

  for (const edge of graph.edges) {
    if (changedSet.has(edge.to) && !changedSet.has(edge.from)) {
      transitiveSet.add(edge.from);
    }
  }

  const transitiveChanges = transitiveSet.size;
  const affectedRoutes = graph.affectedRoutes.length;
  const affectedComponents = graph.affectedComponents.length;
  const affectedLayers = archImpact.affectedLayers;

  // Calculate risk score
  let riskScore = 0;

  // Direct changes (0-25)
  riskScore += Math.min(directChanges * 3, 25);

  // Transitive changes (0-20)
  riskScore += Math.min(transitiveChanges * 4, 20);

  // Routes affected (0-15)
  riskScore += Math.min(affectedRoutes * 5, 15);

  // Components affected (0-10)
  riskScore += Math.min(affectedComponents * 2, 10);

  // Layer count penalty (0-15)
  riskScore += Math.min(affectedLayers.length * 3, 15);

  // Security/Database impact (0-15)
  if (archImpact.securityImpact) riskScore += 10;
  if (archImpact.databaseImpact) riskScore += 8;

  // Cross-layer penalty (0-10)
  if (archImpact.crossLayerChanges) riskScore += 8;

  // Circular dependencies penalty (0-10)
  if (graph.circularDependencies.length > 0) riskScore += 10;

  riskScore = Math.min(Math.round(riskScore), 100);

  let riskLevel: BlastRadius["riskLevel"] = "low";
  if (riskScore >= 75) riskLevel = "critical";
  else if (riskScore >= 50) riskLevel = "high";
  else if (riskScore >= 25) riskLevel = "medium";

  // Count by category
  let servicesAffected = 0;
  let databasesAffected = 0;
  for (const layer of archImpact.layers) {
    if (layer.layer === "backend") servicesAffected = layer.changeCount;
    if (layer.layer === "database") databasesAffected = layer.changeCount;
  }

  const summaryParts: string[] = [];
  summaryParts.push(`${directChanges} file(s) changed`);
  if (transitiveChanges > 0) summaryParts.push(`${transitiveChanges} file(s) transitively affected`);
  if (affectedRoutes > 0) summaryParts.push(`${affectedRoutes} route(s) affected`);
  if (affectedComponents > 0) summaryParts.push(`${affectedComponents} component(s) affected`);
  if (affectedLayers.length > 1) summaryParts.push(`spans ${affectedLayers.length} architectural layers`);

  return {
    directChanges,
    transitiveChanges,
    affectedRoutes,
    affectedComponents,
    affectedLayers,
    riskScore,
    riskLevel,
    summary: summaryParts.join(", ") + ".",
    breakdown: {
      filesChanged: directChanges,
      routesAffected: affectedRoutes,
      componentsAffected: affectedComponents,
      servicesAffected,
      databasesAffected,
    },
  };
}
