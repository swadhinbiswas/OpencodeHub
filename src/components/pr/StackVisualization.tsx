/**
 * Stack Visualization Component
 * Visual tree/timeline showing stacked PRs with status and navigation
 */

import React from "react";
import {
    GitPullRequest,
    GitMerge,
    CircleDot,
    Circle,
    FileEdit,
    ChevronRight,
    Layers,
    ArrowUp
} from "lucide-react";

interface StackEntry {
    order: number;
    pr: {
        id: string;
        number: number;
        title: string;
        state: string;
        isDraft: boolean;
        headBranch: string;
        isMerged: boolean;
    };
    parentPrId: string | null;
}

interface StackVisualizationProps {
    stackId: string;
    stackName?: string;
    baseBranch: string;
    entries: StackEntry[];
    currentPrId?: string;
    owner: string;
    repo: string;
    onReorder?: (newOrder: string[]) => void;
    compact?: boolean;
}

export function StackVisualization({
    stackId,
    stackName,
    baseBranch,
    entries,
    currentPrId,
    owner,
    repo,
    onReorder,
    compact = false,
}: StackVisualizationProps) {
    const getStatusIcon = (entry: StackEntry) => {
        if (entry.pr.isMerged) {
            return <GitMerge className="h-4 w-4 text-purple-500" />;
        }
        if (entry.pr.isDraft) {
            return <FileEdit className="h-4 w-4 text-gray-400" />;
        }
        if (entry.pr.state === "open") {
            return <GitPullRequest className="h-4 w-4 text-green-500" />;
        }
        return <Circle className="h-4 w-4 text-red-500" />;
    };

    const getStatusColor = (entry: StackEntry) => {
        if (entry.pr.isMerged) return "border-purple-500 bg-purple-500/10";
        if (entry.pr.isDraft) return "border-gray-400 bg-gray-400/10";
        if (entry.pr.state === "open") return "border-green-500 bg-green-500/10";
        return "border-red-500 bg-red-500/10";
    };

    const sortedEntries = [...entries].sort((a, b) => a.order - b.order);

    if (compact) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Layers className="h-4 w-4" />
                <span>Stack of {entries.length}</span>
                <div className="flex items-center gap-1">
                    {sortedEntries.map((entry, i) => (
                        <React.Fragment key={entry.pr.id}>
                            <a
                                href={`/${owner}/${repo}/pulls/${entry.pr.number}`}
                                className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${entry.pr.id === currentPrId
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted hover:bg-muted/80"
                                    }`}
                            >
                                #{entry.pr.number}
                            </a>
                            {i < sortedEntries.length - 1 && (
                                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b p-4">
                <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">
                        {stackName || "Stacked Changes"}
                    </h3>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {entries.length} PRs
                    </span>
                </div>
                <div className="text-xs text-muted-foreground">
                    Base: <code className="bg-muted px-1.5 py-0.5 rounded">{baseBranch}</code>
                </div>
            </div>

            {/* Stack Visualization */}
            <div className="p-4">
                <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

                    {/* Base branch indicator */}
                    <div className="relative flex items-center gap-3 mb-4">
                        <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-background">
                            <CircleDot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-medium">{baseBranch}</div>
                            <div className="text-xs text-muted-foreground">Base branch</div>
                        </div>
                    </div>

                    {/* Stack entries */}
                    {sortedEntries.map((entry, index) => {
                        const isCurrent = entry.pr.id === currentPrId;
                        const isLast = index === sortedEntries.length - 1;

                        return (
                            <div
                                key={entry.pr.id}
                                className={`relative flex items-start gap-3 ${isLast ? "" : "mb-3"
                                    }`}
                            >
                                {/* Arrow indicator */}
                                <div className="absolute -left-0.5 -top-6 flex items-center justify-center w-9">
                                    <ArrowUp className="h-4 w-4 text-muted-foreground/50" />
                                </div>

                                {/* Node */}
                                <div
                                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background transition-all ${isCurrent
                                            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                                            : ""
                                        } ${getStatusColor(entry)}`}
                                >
                                    {getStatusIcon(entry)}
                                </div>

                                {/* PR Info */}
                                <a
                                    href={`/${owner}/${repo}/pulls/${entry.pr.number}`}
                                    className={`flex-1 rounded-lg border p-3 transition-all hover:shadow-md ${isCurrent
                                            ? "border-primary bg-primary/5"
                                            : "hover:border-primary/50"
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-muted-foreground">
                                                    #{entry.pr.number}
                                                </span>
                                                {entry.pr.isDraft && (
                                                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                                        Draft
                                                    </span>
                                                )}
                                                {entry.pr.isMerged && (
                                                    <span className="text-xs bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded">
                                                        Merged
                                                    </span>
                                                )}
                                                {isCurrent && (
                                                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                                        Current
                                                    </span>
                                                )}
                                            </div>
                                            <h4 className="font-medium mt-1 line-clamp-1">
                                                {entry.pr.title}
                                            </h4>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                <code className="bg-muted px-1 py-0.5 rounded">
                                                    {entry.pr.headBranch}
                                                </code>
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {entry.order} of {entries.length}
                                        </div>
                                    </div>
                                </a>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Actions */}
            <div className="border-t p-3 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                    {sortedEntries.filter((e) => e.pr.isMerged).length} of {entries.length} merged
                </div>
                <div className="flex items-center gap-2">
                    <button className="text-xs text-primary hover:underline">
                        View all changes
                    </button>
                </div>
            </div>
        </div>
    );
}

export default StackVisualization;
