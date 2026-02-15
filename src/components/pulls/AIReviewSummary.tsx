
import React, { useEffect, useState } from "react";
import {
    AlertTriangle,
    CheckCircle,
    Info,
    XCircle,
    Sparkles,
    ChevronDown,
    ChevronUp,
    FileCode
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Suggestion {
    id: string;
    path: string;
    line?: number;
    severity: "info" | "warning" | "error" | "critical";
    type: string;
    title: string;
    message: string;
    suggestedFix?: string;
    isDismissed: boolean;
}

interface Review {
    id: string;
    status: string;
    summary: string;
    overallSeverity: "info" | "warning" | "error" | "critical";
    updatedAt: string;
}

interface AIReviewSummaryProps {
    owner: string;
    repo: string;
    prNumber: number;
}

export function AIReviewSummary({ owner, repo, prNumber }: AIReviewSummaryProps) {
    const [review, setReview] = useState<Review | null>(null);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);

    const fetchReview = async () => {
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}/ai-review`);
            if (res.ok) {
                const data = await res.json();
                if (data) {
                    setReview(data.review);
                    setSuggestions(data.suggestions || []);
                }
            }
        } catch (e) {
            console.error("Failed to fetch AI review", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReview();
        // Poll every 5s if status is running
        const interval = setInterval(() => {
            if (review?.status === 'running' || review?.status === 'pending') {
                fetchReview();
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [review?.status]);

    if (loading && !review) return null;
    if (!review && !loading) return null; // No review yet

    const severityColor = {
        info: "text-blue-500 border-blue-200 bg-blue-50",
        warning: "text-yellow-600 border-yellow-200 bg-yellow-50",
        error: "text-red-600 border-red-200 bg-red-50",
        critical: "text-red-700 border-red-400 bg-red-100",
    };

    const StatusIcon = {
        info: Info,
        warning: AlertTriangle,
        error: XCircle,
        critical: AlertTriangle
    }[review!.overallSeverity] || Info;

    return (
        <div className="border rounded-lg mb-6 overflow-hidden bg-card">
            <div className="p-4 border-b flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${severityColor[review!.overallSeverity].split(' ')[2]}`}>
                        {review?.status === 'running' ? (
                            <Sparkles className="h-5 w-5 text-purple-500 animate-pulse" />
                        ) : (
                            <StatusIcon className={`h-5 w-5 ${severityColor[review!.overallSeverity].split(' ')[0]}`} />
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold flex items-center gap-2">
                            AI Code Review
                            {review?.status === 'running' && <Badge variant="outline" className="animate-pulse">Analyzing...</Badge>}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {review?.status === 'completed'
                                ? `Completed ${new Date(review.updatedAt).toLocaleString()}`
                                : "Analysis in progress..."}
                        </p>
                    </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </div>

            {expanded && (
                <div className="p-4 space-y-4">
                    {/* Summary */}
                    {review?.summary && (
                        <div className="text-sm prose dark:prose-invert max-w-none bg-muted/50 p-3 rounded">
                            {review.summary}
                        </div>
                    )}

                    {/* Suggestions */}
                    <div className="space-y-3">
                        {suggestions.map(suggestion => (
                            <div key={suggestion.id} className={`border rounded p-3 text-sm ${severityColor[suggestion.severity].split(' ')[2]}`}>
                                <div className="flex items-start gap-2 mb-2">
                                    <Badge variant="outline" className="uppercase text-[10px] tracking-wider bg-background">
                                        {suggestion.severity}
                                    </Badge>
                                    <span className="font-medium text-foreground">{suggestion.title}</span>
                                </div>

                                <p className="text-muted-foreground mb-2">{suggestion.message}</p>

                                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono bg-background/50 p-1 rounded w-fit mb-2">
                                    <FileCode className="h-3 w-3" />
                                    {suggestion.path}
                                    {suggestion.line && <span className="bg-muted px-1 rounded">L{suggestion.line}</span>}
                                </div>

                                {suggestion.suggestedFix && (
                                    <div className="mt-2 bg-slate-950 text-slate-50 p-2 rounded font-mono text-xs overflow-x-auto">
                                        <div className="text-muted-foreground mb-1 select-none">// Suggested Fix</div>
                                        <pre>{suggestion.suggestedFix}</pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
