/**
 * AI Review Panel Component
 * Display AI review suggestions with apply/dismiss actions
 */

import React, { useState } from "react";
import {
    Bot,
    AlertTriangle,
    AlertCircle,
    Info,
    XCircle,
    Check,
    X,
    ChevronDown,
    ChevronRight,
    Sparkles,
    Loader2,
    RefreshCw,
} from "lucide-react";

interface Suggestion {
    id: string;
    path: string;
    line?: number;
    endLine?: number;
    severity: "info" | "warning" | "error" | "critical";
    type: string;
    title: string;
    message: string;
    suggestedFix?: string;
    explanation?: string;
    isApplied?: boolean;
    isDismissed?: boolean;
}

interface AIReviewPanelProps {
    reviewId: string;
    status: "pending" | "running" | "completed" | "failed";
    model: string;
    summary?: string;
    suggestions: Suggestion[];
    onApply?: (suggestionId: string) => Promise<void>;
    onDismiss?: (suggestionId: string, reason?: string) => Promise<void>;
    onRefresh?: () => Promise<void>;
}

const severityConfig = {
    info: {
        icon: Info,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
    },
    warning: {
        icon: AlertTriangle,
        color: "text-yellow-500",
        bg: "bg-yellow-500/10",
        border: "border-yellow-500/20",
    },
    error: {
        icon: AlertCircle,
        color: "text-orange-500",
        bg: "bg-orange-500/10",
        border: "border-orange-500/20",
    },
    critical: {
        icon: XCircle,
        color: "text-red-500",
        bg: "bg-red-500/10",
        border: "border-red-500/20",
    },
};

export function AIReviewPanel({
    reviewId,
    status,
    model,
    summary,
    suggestions,
    onApply,
    onDismiss,
    onRefresh,
}: AIReviewPanelProps) {
    const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(
        new Set()
    );
    const [applyingId, setApplyingId] = useState<string | null>(null);
    const [dismissingId, setDismissingId] = useState<string | null>(null);

    const toggleExpanded = (id: string) => {
        const newExpanded = new Set(expandedSuggestions);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedSuggestions(newExpanded);
    };

    const handleApply = async (suggestionId: string) => {
        if (!onApply) return;
        setApplyingId(suggestionId);
        try {
            await onApply(suggestionId);
        } finally {
            setApplyingId(null);
        }
    };

    const handleDismiss = async (suggestionId: string) => {
        if (!onDismiss) return;
        setDismissingId(suggestionId);
        try {
            await onDismiss(suggestionId);
        } finally {
            setDismissingId(null);
        }
    };

    const activeSuggestions = suggestions.filter(
        (s) => !s.isApplied && !s.isDismissed
    );
    const resolvedSuggestions = suggestions.filter(
        (s) => s.isApplied || s.isDismissed
    );

    const severityCounts = activeSuggestions.reduce(
        (acc, s) => {
            acc[s.severity] = (acc[s.severity] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );

    return (
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b p-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-semibold flex items-center gap-2">
                            AI Code Review
                            <Sparkles className="h-4 w-4 text-yellow-500" />
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Powered by {model}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {status === "running" && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Analyzing...
                        </div>
                    )}
                    {status === "completed" && onRefresh && (
                        <button
                            onClick={onRefresh}
                            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Re-run
                        </button>
                    )}
                </div>
            </div>

            {/* Status */}
            {status === "pending" && (
                <div className="p-6 text-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p>Preparing AI review...</p>
                </div>
            )}

            {status === "failed" && (
                <div className="p-6 text-center">
                    <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                    <p className="text-red-500 font-medium">Review failed</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Please try again or check your configuration
                    </p>
                </div>
            )}

            {status === "completed" && (
                <>
                    {/* Summary */}
                    {summary && (
                        <div className="p-4 border-b bg-muted/30">
                            <p className="text-sm">{summary}</p>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-4 p-4 border-b">
                        <div className="text-sm text-muted-foreground">
                            {activeSuggestions.length} active suggestions
                        </div>
                        <div className="flex items-center gap-2">
                            {severityCounts.critical && (
                                <span className="flex items-center gap-1 text-xs text-red-500">
                                    <XCircle className="h-3 w-3" />
                                    {severityCounts.critical} critical
                                </span>
                            )}
                            {severityCounts.error && (
                                <span className="flex items-center gap-1 text-xs text-orange-500">
                                    <AlertCircle className="h-3 w-3" />
                                    {severityCounts.error} errors
                                </span>
                            )}
                            {severityCounts.warning && (
                                <span className="flex items-center gap-1 text-xs text-yellow-500">
                                    <AlertTriangle className="h-3 w-3" />
                                    {severityCounts.warning} warnings
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Suggestions List */}
                    <div className="divide-y">
                        {activeSuggestions.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground">
                                <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
                                <p>All clear! No issues found.</p>
                            </div>
                        ) : (
                            activeSuggestions.map((suggestion) => {
                                const config = severityConfig[suggestion.severity];
                                const Icon = config.icon;
                                const isExpanded = expandedSuggestions.has(suggestion.id);

                                return (
                                    <div
                                        key={suggestion.id}
                                        className={`${config.bg} ${config.border} border-l-4`}
                                    >
                                        {/* Suggestion Header */}
                                        <button
                                            className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
                                            onClick={() => toggleExpanded(suggestion.id)}
                                        >
                                            <Icon className={`h-5 w-5 mt-0.5 ${config.color}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{suggestion.title}</span>
                                                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                        {suggestion.type}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-muted-foreground mt-1">
                                                    <code className="bg-muted px-1 rounded">
                                                        {suggestion.path}
                                                        {suggestion.line && `:${suggestion.line}`}
                                                    </code>
                                                </div>
                                            </div>
                                            {isExpanded ? (
                                                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                            ) : (
                                                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                            )}
                                        </button>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div className="px-4 pb-4 pl-12">
                                                <p className="text-sm mb-3">{suggestion.message}</p>

                                                {suggestion.explanation && (
                                                    <div className="text-sm text-muted-foreground mb-3 p-2 bg-muted/50 rounded">
                                                        <strong>Why:</strong> {suggestion.explanation}
                                                    </div>
                                                )}

                                                {suggestion.suggestedFix && (
                                                    <div className="mb-3">
                                                        <p className="text-xs text-muted-foreground mb-1">
                                                            Suggested fix:
                                                        </p>
                                                        <pre className="text-sm bg-muted p-2 rounded overflow-x-auto">
                                                            <code>{suggestion.suggestedFix}</code>
                                                        </pre>
                                                    </div>
                                                )}

                                                {/* Actions */}
                                                <div className="flex items-center gap-2">
                                                    {suggestion.suggestedFix && onApply && (
                                                        <button
                                                            onClick={() => handleApply(suggestion.id)}
                                                            disabled={applyingId === suggestion.id}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                                                        >
                                                            {applyingId === suggestion.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Check className="h-4 w-4" />
                                                            )}
                                                            Apply Fix
                                                        </button>
                                                    )}
                                                    {onDismiss && (
                                                        <button
                                                            onClick={() => handleDismiss(suggestion.id)}
                                                            disabled={dismissingId === suggestion.id}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors"
                                                        >
                                                            {dismissingId === suggestion.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <X className="h-4 w-4" />
                                                            )}
                                                            Dismiss
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Resolved suggestions */}
                    {resolvedSuggestions.length > 0 && (
                        <div className="border-t p-4">
                            <p className="text-sm text-muted-foreground">
                                {resolvedSuggestions.length} resolved suggestions
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default AIReviewPanel;
