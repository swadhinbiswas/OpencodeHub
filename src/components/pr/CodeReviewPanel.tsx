"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Layers,
  Database,
  Server,
  Monitor,
  Lock,
  TestTube,
  FileText,
  Zap,
  RefreshCw,
  MessageSquare,
  TrendingUp,
  Minus,
  Eye,
} from "lucide-react";

interface AnalysisData {
  id: string;
  status: string;
  healthScore: number | null;
  healthGrade: string | null;
  blastRadius: {
    directChanges: number;
    transitiveChanges: number;
    affectedRoutes: number;
    affectedComponents: number;
    affectedLayers: string[];
    riskScore: number;
    riskLevel: string;
    summary: string;
  } | null;
  architectureImpact: {
    layers: Array<{
      layer: string;
      files: string[];
      changeCount: number;
      severity: string;
    }>;
    crossLayerChanges: boolean;
    affectedLayers: string[];
    riskLevel: string;
    riskSummary: string;
    securityImpact: boolean;
    databaseImpact: boolean;
  } | null;
  changeGroups: Array<{
    id: string;
    title: string;
    description: string;
    files: string[];
    layer: string;
    riskLevel: string;
    totalAdditions: number;
    totalDeletions: number;
  }> | null;
  complexityData: {
    cyclomaticComplexity: number;
    nestingDepth: number;
    longFunctions: Array<{ name: string; lines: number }>;
    riskLevel: string;
  } | null;
  summaries: any;
  filesAnalyzed: number;
  totalAdditions: number;
  totalDeletions: number;
  model: string | null;
  provider: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface InlineComment {
  id: string;
  filePath: string;
  line: number;
  severity: string;
  type: string;
  category: string;
  title: string;
  message: string;
  suggestedFix: string | null;
  explanation: string | null;
  confidence: number | null;
  isResolved: number | null;
  isApplied: number | null;
}

interface Props {
  owner: string;
  repo: string;
  prNumber: number;
}

const LAYER_ICONS: Record<string, React.ComponentType<any>> = {
  database: Database,
  backend: Server,
  frontend: Monitor,
  infrastructure: Layers,
  security: Lock,
  testing: TestTube,
  documentation: FileText,
  config: FileText,
};

function getSeverityConfig(severity: string) {
  switch (severity) {
    case "critical":
    case "error":
      return { color: "text-red-500", bg: "bg-red-500/10", icon: XCircle };
    case "warning":
    case "medium":
      return { color: "text-yellow-500", bg: "bg-yellow-500/10", icon: AlertTriangle };
    case "info":
      return { color: "text-blue-500", bg: "bg-blue-500/10", icon: Info };
    case "low":
      return { color: "text-green-500", bg: "bg-green-500/10", icon: CheckCircle2 };
    default:
      return { color: "text-muted-foreground", bg: "bg-muted", icon: Info };
  }
}

function getGradeColor(grade: string | null) {
  switch (grade) {
    case "A+":
    case "A":
      return "text-green-500";
    case "B":
      return "text-blue-500";
    case "C":
      return "text-yellow-500";
    case "D":
      return "text-orange-500";
    case "F":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function CodeReviewPanel({ owner, repo, prNumber }: Props) {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [comments, setComments] = useState<InlineComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"overview" | "groups" | "comments">("overview");

  const fetchAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}/analysis`);
      const data = await res.json();
      if (data.data) {
        setAnalysis(data.data.analysis);
        setComments(data.data.inlineComments || []);
      }
    } catch (err) {
      console.error("Failed to fetch analysis:", err);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, prNumber]);

  const triggerAnalysis = useCallback(async () => {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}/analysis`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.data?.status === "running") {
        const pollInterval = setInterval(async () => {
          const pollRes = await fetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}/analysis`);
          const pollData = await pollRes.json();
          if (pollData.data?.analysis?.status === "completed" || pollData.data?.analysis?.status === "failed") {
            clearInterval(pollInterval);
            await fetchAnalysis();
            setAnalyzing(false);
          }
        }, 3000);
      }
    } catch (err) {
      console.error("Failed to trigger analysis:", err);
      setAnalyzing(false);
    }
  }, [owner, repo, prNumber, fetchAnalysis]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  useEffect(() => {
    if (analysis?.status === "running") {
      const interval = setInterval(fetchAnalysis, 5000);
      return () => clearInterval(interval);
    }
  }, [analysis?.status, fetchAnalysis]);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="border border-border bg-card rounded-lg p-6">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground">Loading analysis...</span>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="border border-border bg-card rounded-lg p-6">
        <div className="text-center">
          <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-foreground mb-1">No Analysis Yet</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Run an AI-powered analysis to get code review insights.
          </p>
          <button
            onClick={triggerAnalysis}
            disabled={analyzing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {analyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            {analyzing ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>
      </div>
    );
  }

  const gradeColor = getGradeColor(analysis.healthGrade);
  const riskConfig = getSeverityConfig(analysis.blastRadius?.riskLevel || "low");
  const RiskIcon = riskConfig.icon;

  return (
    <div className="space-y-4">
      {/* Health Score Header */}
      <div className="border border-border bg-card rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-14 h-14 rounded-full border-4 border-current flex items-center justify-center ${gradeColor}`}>
                <span className="text-lg font-bold">{analysis.healthScore || "—"}</span>
              </div>
              <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-card border border-border">
                {analysis.healthGrade || "—"}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">PR Health Score</h3>
              <p className="text-xs text-muted-foreground">
                {analysis.filesAnalyzed} file(s) analyzed • +{analysis.totalAdditions}/-{analysis.totalDeletions}
              </p>
            </div>
          </div>
          <button
            onClick={triggerAnalysis}
            disabled={analyzing}
            className="p-2 rounded-lg border border-border hover:bg-accent disabled:opacity-50 transition-all"
            title="Re-run analysis"
          >
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${analyzing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Risk Badge */}
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${riskConfig.bg} ${riskConfig.color}`}>
          <RiskIcon className="h-3.5 w-3.5" />
          {analysis.blastRadius?.riskLevel?.charAt(0).toUpperCase()}{analysis.blastRadius?.riskLevel?.slice(1)} Risk
        </div>

        {/* Blast Radius */}
        {analysis.blastRadius && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-lg font-bold text-foreground">{analysis.blastRadius.directChanges}</div>
              <div className="text-[10px] text-muted-foreground">Files Changed</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-lg font-bold text-foreground">{analysis.blastRadius.affectedRoutes}</div>
              <div className="text-[10px] text-muted-foreground">Routes Affected</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-lg font-bold text-foreground">{analysis.blastRadius.affectedComponents}</div>
              <div className="text-[10px] text-muted-foreground">Components</div>
            </div>
          </div>
        )}

        {analysis.blastRadius?.summary && (
          <p className="mt-2 text-xs text-muted-foreground">{analysis.blastRadius.summary}</p>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border border-border bg-card rounded-lg p-1">
        <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
          <Eye className="h-3.5 w-3.5 inline mr-1" />
          Overview
        </TabButton>
        <TabButton active={activeTab === "groups"} onClick={() => setActiveTab("groups")}>
          <Layers className="h-3.5 w-3.5 inline mr-1" />
          Groups
        </TabButton>
        <TabButton active={activeTab === "comments"} onClick={() => setActiveTab("comments")}>
          <MessageSquare className="h-3.5 w-3.5 inline mr-1" />
          Comments
          {comments.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]">
              {comments.length}
            </span>
          )}
        </TabButton>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Architecture Impact */}
          {analysis.architectureImpact && (
            <div className="border border-border bg-card rounded-lg p-4">
              <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Architecture Impact
              </h4>
              <div className="space-y-2">
                {analysis.architectureImpact.layers.map((layer, i) => {
                  const LayerIcon = LAYER_ICONS[layer.layer] || Layers;
                  const sevColor = layer.severity === "high" ? "bg-red-500/10 text-red-500"
                    : layer.severity === "medium" ? "bg-yellow-500/10 text-yellow-500"
                    : "bg-green-500/10 text-green-500";
                  return (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <LayerIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-foreground capitalize">{layer.layer}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{layer.changeCount} file(s)</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sevColor}`}>
                          {layer.severity}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {analysis.architectureImpact.crossLayerChanges && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-500 text-xs">
                  <AlertTriangle className="h-4 w-4" />
                  Changes span multiple architectural layers — review carefully
                </div>
              )}
              {analysis.architectureImpact.securityImpact && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-500 text-xs">
                  <ShieldAlert className="h-4 w-4" />
                  Security-related files modified
                </div>
              )}
            </div>
          )}

          {/* Complexity */}
          {analysis.complexityData && (
            <div className="border border-border bg-card rounded-lg p-4">
              <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Complexity Analysis
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-muted/50">
                  <div className="text-lg font-bold text-foreground">{analysis.complexityData.cyclomaticComplexity}</div>
                  <div className="text-[10px] text-muted-foreground">Cyclomatic Complexity</div>
                </div>
                <div className="p-2 rounded-lg bg-muted/50">
                  <div className="text-lg font-bold text-foreground">{analysis.complexityData.nestingDepth}</div>
                  <div className="text-[10px] text-muted-foreground">Max Nesting Depth</div>
                </div>
              </div>
              {analysis.complexityData.longFunctions.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium">Long Functions:</p>
                  {analysis.complexityData.longFunctions.map((fn, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Minus className="h-3 w-3" />
                      <span className="font-mono">{fn.name}</span>
                      <span className="text-yellow-500">({fn.lines} lines)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Summary */}
          {analysis.summaries?.overall && (
            <div className="border border-border bg-card rounded-lg p-4">
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                AI Summary
              </h4>
              <p className="text-sm text-foreground leading-relaxed">
                {analysis.summaries.overall.summary}
              </p>
              {analysis.summaries.overall.keyChanges?.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {analysis.summaries.overall.keyChanges.map((change: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-green-500" />
                      {change}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* AI Provider Info */}
          {analysis.provider && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
              <Zap className="h-3 w-3" />
              Analyzed by {analysis.provider}{analysis.model ? ` (${analysis.model})` : ""}
            </div>
          )}
        </div>
      )}

      {/* Groups Tab */}
      {activeTab === "groups" && (
        <div className="space-y-2">
          {analysis.changeGroups && analysis.changeGroups.length > 0 ? (
            analysis.changeGroups.map(group => {
              const isExpanded = expandedGroups.has(group.id);
              const groupRisk = getSeverityConfig(group.riskLevel);
              const GroupRiskIcon = groupRisk.icon;
              const LayerIcon = LAYER_ICONS[group.layer] || Layers;

              return (
                <div key={group.id} className="border border-border bg-card rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <LayerIcon className="h-4 w-4 text-muted-foreground" />
                      <div className="text-left">
                        <div className="text-sm font-medium text-foreground">{group.title}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {group.files.length} file(s) • +{group.totalAdditions}/-{group.totalDeletions}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${groupRisk.bg} ${groupRisk.color}`}>
                        {group.riskLevel}
                      </span>
                    </div>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border p-3 space-y-1">
                          {group.files.map(file => (
                            <div key={file} className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                              <FileText className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{file}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          ) : (
            <div className="border border-dashed border-border rounded-lg py-8 text-center">
              <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No change groups available</p>
            </div>
          )}
        </div>
      )}

      {/* Comments Tab */}
      {activeTab === "comments" && (
        <div className="space-y-2">
          {comments.length > 0 ? (
            comments.map(comment => {
              const cfg = getSeverityConfig(comment.severity);
              const CommentIcon = cfg.icon;
              return (
                <div key={comment.id} className="border border-border bg-card rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <CommentIcon className={`h-4 w-4 ${cfg.color}`} />
                      <span className="text-sm font-medium text-foreground">{comment.title}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
                      {comment.severity}
                    </span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed mb-2">{comment.message}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono">{comment.filePath}:{comment.line}</span>
                    <span>•</span>
                    <span className="capitalize">{comment.type}</span>
                    {comment.confidence != null && (
                      <>
                        <span>•</span>
                        <span>{comment.confidence}% confidence</span>
                      </>
                    )}
                  </div>
                  {comment.suggestedFix && (
                    <div className="mt-2 p-2 rounded bg-muted/50 text-xs font-mono text-foreground overflow-x-auto">
                      {comment.suggestedFix}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="border border-dashed border-border rounded-lg py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No inline comments yet</p>
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {analysis.status === "failed" && analysis.errorMessage && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-red-500">
            <XCircle className="h-4 w-4" />
            Analysis failed: {analysis.errorMessage}
          </div>
        </div>
      )}

      {/* Running State */}
      {analysis.status === "running" && (
        <div className="border border-primary/30 bg-primary/5 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-primary">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Analysis in progress...
          </div>
        </div>
      )}
    </div>
  );
}
