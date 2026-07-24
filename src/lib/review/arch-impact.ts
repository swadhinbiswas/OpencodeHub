/**
 * Architecture Impact Engine
 * Classifies changes by architectural layer and detects cross-layer impacts.
 */

import type { DiffChunk } from "./diff-chunker";
import { detectLanguage } from "./language-detect";

export type ArchLayer = "database" | "backend" | "frontend" | "infrastructure" | "security" | "testing" | "documentation" | "config";

export interface ImpactLayer {
  layer: ArchLayer;
  files: string[];
  changeCount: number;
  severity: "low" | "medium" | "high";
}

export interface ArchImpact {
  layers: ImpactLayer[];
  crossLayerChanges: boolean;
  affectedLayers: ArchLayer[];
  riskLevel: "low" | "medium" | "high" | "critical";
  riskSummary: string;
  securityImpact: boolean;
  databaseImpact: boolean;
}

// File path patterns for each architectural layer
const LAYER_RULES: { layer: ArchLayer; patterns: RegExp[]; weight: number }[] = [
  {
    layer: "database",
    patterns: [
      /schema\.(prisma|sql|graphql|graphqls)/i,
      /migrat/i,
      /drizzle/i,
      /\.entity\./i,
      /\.model\./i,
      /models?\//i,
      /db\//i,
      /database/i,
      /\.schema\./i,
      /seed/i,
    ],
    weight: 3,
  },
  {
    layer: "backend",
    patterns: [
      /api\//i,
      /routes?\//i,
      /controllers?\//i,
      /services?\//i,
      /handlers?\//i,
      /middleware/i,
      /resolvers?\//i,
      /server/i,
      /lib\//i,
      /worker/i,
      /queue/i,
      /cron/i,
      /background/i,
      /src\/pages\/api\//i,
    ],
    weight: 2,
  },
  {
    layer: "frontend",
    patterns: [
      /components?\//i,
      /pages?\//i,
      /views?\//i,
      /layouts?\//i,
      /hooks?\//i,
      /stores?\//i,
      /contexts?\//i,
      /\.tsx?$/i,
      /\.vue$/i,
      /\.svelte$/i,
      /\.astro$/i,
      /styles?\//i,
      /public\//i,
      /assets?\//i,
    ],
    weight: 2,
  },
  {
    layer: "infrastructure",
    patterns: [
      /dockerfile/i,
      /docker-compose/i,
      /\.tf$/i,
      /\.hcl$/i,
      /terraform/i,
      /kubernetes/i,
      /\.github\/workflows/i,
      /\.gitlab-ci/i,
      /nginx/i,
      /systemd/i,
      /deploy\//i,
      /ci\/cd/i,
    ],
    weight: 3,
  },
  {
    layer: "security",
    patterns: [
      /auth/i,
      /security/i,
      /permission/i,
      /rbac/i,
      /oauth/i,
      /jwt/i,
      /session/i,
      /token/i,
      /password/i,
      /encrypt/i,
      /csrf/i,
      /cors/i,
    ],
    weight: 4,
  },
  {
    layer: "testing",
    patterns: [
      /\.test\./i,
      /\.spec\./i,
      /__tests__\//i,
      /test\//i,
      /tests\//i,
      /e2e\//i,
      /cypress/i,
      /playwright/i,
      /vitest/i,
      /jest/i,
    ],
    weight: 1,
  },
  {
    layer: "documentation",
    patterns: [
      /\.md$/i,
      /\.mdx$/i,
      /docs?\//i,
      /readme/i,
      /changelog/i,
      /license/i,
    ],
    weight: 0,
  },
];

function classifyFile(filePath: string): ArchLayer[] {
  const layers: ArchLayer[] = [];

  for (const rule of LAYER_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(filePath)) {
        layers.push(rule.layer);
        break;
      }
    }
  }

  if (layers.length === 0) {
    const lang = detectLanguage(filePath);
    if (lang.category === "infrastructure") layers.push("infrastructure");
    else if (lang.category === "config") layers.push("config");
    else if (lang.category === "data") layers.push("database");
    else layers.push("backend");
  }

  return layers;
}

function calculateLayerSeverity(layer: ArchLayer, fileCount: number): ImpactLayer["severity"] {
  const thresholds: Record<ArchLayer, [number, number]> = {
    database: [1, 3],
    security: [1, 3],
    backend: [2, 5],
    frontend: [3, 8],
    infrastructure: [1, 2],
    testing: [5, 10],
    documentation: [10, 20],
    config: [3, 6],
  };

  const [low, high] = thresholds[layer] || [3, 8];
  if (fileCount >= high) return "high";
  if (fileCount >= low) return "medium";
  return "low";
}

export function assessArchitectureImpact(chunks: DiffChunk[]): ArchImpact {
  const layerFiles = new Map<ArchLayer, string[]>();
  const allLayers = new Set<ArchLayer>();

  for (const chunk of chunks) {
    const layers = classifyFile(chunk.filePath);
    for (const layer of layers) {
      if (!layerFiles.has(layer)) layerFiles.set(layer, []);
      layerFiles.get(layer)!.push(chunk.filePath);
      allLayers.add(layer);
    }
  }

  const layers: ImpactLayer[] = Array.from(layerFiles.entries()).map(([layer, files]) => ({
    layer,
    files,
    changeCount: files.length,
    severity: calculateLayerSeverity(layer, files.length),
  }));

  const affectedLayers = Array.from(allLayers);
  const crossLayerChanges = affectedLayers.length > 1;
  const securityImpact = allLayers.has("security");
  const databaseImpact = allLayers.has("database");

  // Risk calculation
  let riskScore = 0;
  for (const layer of layers) {
    const weight = LAYER_RULES.find(r => r.layer === layer.layer)?.weight || 1;
    const severityMultiplier = layer.severity === "high" ? 3 : layer.severity === "medium" ? 2 : 1;
    riskScore += weight * severityMultiplier * layer.changeCount;
  }

  // Cross-layer penalty
  if (crossLayerChanges) riskScore += 5;
  if (securityImpact) riskScore += 10;
  if (databaseImpact) riskScore += 8;

  let riskLevel: ArchImpact["riskLevel"] = "low";
  if (riskScore >= 30) riskLevel = "critical";
  else if (riskScore >= 20) riskLevel = "high";
  else if (riskScore >= 10) riskLevel = "medium";

  const riskParts: string[] = [];
  if (crossLayerChanges) riskParts.push(`Changes span ${affectedLayers.length} layers`);
  if (securityImpact) riskParts.push("Security-related files modified");
  if (databaseImpact) riskParts.push("Database schema/migrations affected");

  const highSeverityLayers = layers.filter(l => l.severity === "high");
  if (highSeverityLayers.length > 0) {
    riskParts.push(`High impact in: ${highSeverityLayers.map(l => l.layer).join(", ")}`);
  }

  return {
    layers,
    crossLayerChanges,
    affectedLayers,
    riskLevel,
    riskSummary: riskParts.length > 0 ? riskParts.join(". ") + "." : "Changes are localized to a single layer.",
    securityImpact,
    databaseImpact,
  };
}
