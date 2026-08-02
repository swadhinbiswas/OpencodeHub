"use client";
import { motion, AnimatePresence } from "framer-motion";
import {
    GitPullRequest,
    GitMerge,
    XCircle,
    MessageSquare,
    Search,
    Tag,
    Calendar,
    User,
    ArrowUpDown,
    Plus,
    GitBranch,
    CheckCircle2,
    Link2,
    Loader2
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PullRequest {
    id: string;
    number: number;
    title: string;
    state: "open" | "closed" | "merged";
    createdAt: string;
    commentCount: number;
    sourceBranch: string;
    targetBranch: string;
    author: {
        username: string;
        avatarUrl?: string;
    };
    labels?: Array<{
        name: string;
        color: string;
    }>;
    isDraft?: boolean;
}

interface Props {
    pullRequests: PullRequest[];
    openCount: number;
    closedCount: number;
    repoOwner: string;
    repoName: string;
}

interface DependencyGraphResponse {
    nodes: Array<{
        prId: string;
        prNumber: number;
        title: string;
        dependsOn: string[];
        blockedBy: string[];
        dependencyType: "branch" | "files" | "manual";
    }>;
    edges: Array<{
        from: string;
        to: string;
        type: string;
    }>;
}

interface StackOrderSuggestion {
    order: string[];
    cycles: string[][];
}

function timeAgo(date: string): string {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} days ago`;

    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} months ago`;
}

function getPRIcon(state: string, isDraft?: boolean) {
    if (isDraft) {
        return { icon: GitPullRequest, color: "text-muted-foreground", bg: "bg-gray-500/10" };
    }
    switch (state) {
        case "open":
            return { icon: GitPullRequest, color: "text-green-400", bg: "bg-green-500/10" };
        case "merged":
            return { icon: GitMerge, color: "text-purple-400", bg: "bg-purple-500/10" };
        case "closed":
            return { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" };
        default:
            return { icon: GitPullRequest, color: "text-muted-foreground", bg: "bg-gray-500/10" };
    }
}

export default function PullRequestsList({ pullRequests, openCount, closedCount, repoOwner, repoName }: Props) {
    const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedPrIds, setSelectedPrIds] = useState<string[]>([]);
    const [graph, setGraph] = useState<DependencyGraphResponse | null>(null);
    const [suggestion, setSuggestion] = useState<StackOrderSuggestion | null>(null);
    const [workflowMsg, setWorkflowMsg] = useState<string>("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [isBulkMerging, setIsBulkMerging] = useState(false);
    const [bulkMergeMethod, setBulkMergeMethod] = useState<"merge" | "squash" | "rebase">("merge");

    const prById = new Map(pullRequests.map((pr) => [pr.id, pr]));

    const filteredPRs = pullRequests.filter(pr => {
        const matchesFilter = filter === "all" ||
            (filter === "open" && pr.state === "open") ||
            (filter === "closed" && (pr.state === "closed" || pr.state === "merged"));
        const matchesSearch = pr.title.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const toggleSelectPr = (prId: string) => {
        setSelectedPrIds((prev) =>
            prev.includes(prId) ? prev.filter((id) => id !== prId) : [...prev, prId]
        );
    };

    const selectAllVisibleOpen = () => {
        const ids = filteredPRs.filter((pr) => pr.state === "open").map((pr) => pr.id);
        setSelectedPrIds(ids);
    };

    const analyzeDependencies = async () => {
        setIsAnalyzing(true);
        setWorkflowMsg("");
        try {
            const response = await fetch(
                `/api/repos/${repoOwner}/${repoName}/pulls/dependencies?includeFiles=true`
            );
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error?.message || "Failed to analyze dependencies");
            }
            setGraph(payload?.data?.graph || null);
            const nodes = payload?.data?.graph?.nodes?.length || 0;
            const edges = payload?.data?.graph?.edges?.length || 0;
            setWorkflowMsg(`Dependency graph updated (${nodes} PRs, ${edges} edges).`);
            toast.success(`Found ${nodes} PRs with ${edges} dependencies`);
        } catch (error: any) {
            setWorkflowMsg(error?.message || "Failed to analyze dependencies");
            toast.error(error?.message || "Failed to analyze dependencies");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const suggestStackOrder = async () => {
        if (selectedPrIds.length < 2) {
            setWorkflowMsg("Select at least 2 open PRs to generate a stack suggestion.");
            return;
        }

        setIsSuggesting(true);
        setWorkflowMsg("");
        try {
            const response = await fetch(`/api/repos/${repoOwner}/${repoName}/pulls/stack-order`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ prIds: selectedPrIds }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error?.message || "Failed to suggest stack order");
            }
            const data = payload?.data as StackOrderSuggestion;
            setSuggestion(data);
            if (data.cycles.length > 0) {
                setWorkflowMsg("Cycles detected. Resolve dependencies before applying a stack order.");
            } else {
                setWorkflowMsg(`Suggested order generated for ${data.order.length} PRs.`);
            }
        } catch (error: any) {
            setWorkflowMsg(error?.message || "Failed to suggest stack order");
        } finally {
            setIsSuggesting(false);
        }
    };

    const applySuggestedOrder = async () => {
        if (!suggestion || suggestion.order.length < 2) {
            setWorkflowMsg("Generate a valid suggestion before applying.");
            return;
        }
        if (suggestion.cycles.length > 0) {
            setWorkflowMsg("Cannot apply stack order while dependency cycles exist.");
            return;
        }

        setIsApplying(true);
        setWorkflowMsg("");
        try {
            const response = await fetch(`/api/repos/${repoOwner}/${repoName}/pulls/stack-order`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    prIds: suggestion.order,
                    name: `Dependency stack (${suggestion.order.length} PRs)`,
                }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error?.message || "Failed to apply stack order");
            }
            setWorkflowMsg(`Created stack ${payload?.data?.stackId}.`);
            toast.success("Stack created successfully");
            window.location.reload();
        } catch (error: any) {
            setWorkflowMsg(error?.message || "Failed to apply stack order");
            toast.error(error?.message || "Failed to apply stack order");
        } finally {
            setIsApplying(false);
        }
    };

    const bulkMergeSelected = async () => {
        if (selectedPrIds.length === 0) {
            setWorkflowMsg("Select at least one open PR to bulk merge.");
            return;
        }

        setIsBulkMerging(true);
        setWorkflowMsg("");
        try {
            const response = await fetch(`/api/repos/${repoOwner}/${repoName}/pulls/bulk-merge`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    prIds: selectedPrIds,
                    mergeMethod: bulkMergeMethod,
                }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error?.message || "Failed to bulk merge selected PRs");
            }

            const merged = payload?.data?.merged?.length || 0;
            const failed = payload?.data?.failed?.length || 0;
            const skipped = payload?.data?.skipped?.length || 0;
            setWorkflowMsg(`Bulk merge complete: merged ${merged}, failed ${failed}, skipped ${skipped}.`);
            if (merged > 0) toast.success(`Merged ${merged} PR(s)`);
            if (failed > 0) toast.error(`Failed to merge ${failed} PR(s)`);
            setSelectedPrIds([]);
            setTimeout(() => window.location.reload(), 1000);
        } catch (error: any) {
            setWorkflowMsg(error?.message || "Failed to bulk merge selected PRs");
            toast.error(error?.message || "Failed to bulk merge");
        } finally {
            setIsBulkMerging(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
                {/* Search Input */}
                <div className="relative flex-1 max-w-xl">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="search"
                        placeholder="Search all pull requests..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <motion.a
                        href={`/${repoOwner}/${repoName}/labels`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
                    >
                        <Tag className="h-4 w-4" />
                        Labels
                    </motion.a>
                    <motion.a
                        href={`/${repoOwner}/${repoName}/milestones`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
                    >
                        <Calendar className="h-4 w-4" />
                        Milestones
                    </motion.a>
                    <motion.a
                        href={`/${repoOwner}/${repoName}/compare`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 transition-all"
                    >
                        <Plus className="h-4 w-4" />
                        New Pull Request
                    </motion.a>
                </div>
            </motion.div>

            {/* PRs Container */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
            >
                {/* Dependency Workflow */}
                <div className="mb-4 rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium text-foreground">Dependency Workflow</p>
                            <p className="text-xs text-muted-foreground">
                                Detect cross-PR dependencies, suggest stack order, and apply it directly.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={analyzeDependencies}
                                disabled={isAnalyzing}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-all"
                            >
                                {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                                Analyze Dependencies
                            </button>
                            <button
                                type="button"
                                onClick={selectAllVisibleOpen}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
                            >
                                Select Visible Open
                            </button>
                            <button
                                type="button"
                                onClick={suggestStackOrder}
                                disabled={isSuggesting}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-all"
                            >
                                {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                                Suggest Order ({selectedPrIds.length})
                            </button>
                            <button
                                type="button"
                                onClick={applySuggestedOrder}
                                disabled={isApplying || !suggestion || suggestion.cycles.length > 0}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
                            >
                                {isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Apply As Stack
                            </button>
                            <select
                                value={bulkMergeMethod}
                                onChange={(event) => setBulkMergeMethod(event.target.value as "merge" | "squash" | "rebase")}
                                className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground focus:outline-none focus:border-primary/50"
                            >
                                <option value="merge">Merge</option>
                                <option value="squash">Squash</option>
                                <option value="rebase">Rebase</option>
                            </select>
                            <button
                                type="button"
                                onClick={bulkMergeSelected}
                                disabled={isBulkMerging || selectedPrIds.length === 0}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
                            >
                                {isBulkMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                                Bulk Merge Selected
                            </button>
                        </div>
                    </div>
                    {graph && (
                        <div className="mt-3 text-xs text-muted-foreground">
                            Graph: {graph.nodes.length} PRs, {graph.edges.length} edges (
                            {graph.edges.filter((edge) => edge.type === "files").length} file conflicts)
                        </div>
                    )}
                    {suggestion && (
                        <div className="mt-2 text-xs text-muted-foreground">
                            Suggested:{" "}
                            {suggestion.order.map((id) => {
                                const pr = prById.get(id);
                                return pr ? `#${pr.number}` : id;
                            }).join(" -> ")}
                        </div>
                    )}
                    {workflowMsg && (
                        <div className="mt-2 text-xs text-muted-foreground">{workflowMsg}</div>
                    )}
                </div>

                <div className="rounded-lg border border-border bg-card overflow-hidden">
                    {/* Filter Header */}
                    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setFilter("open")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === "open"
                                        ? "bg-primary/10 text-primary border border-primary/30"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                                    }`}
                            >
                                <GitPullRequest className="h-4 w-4" />
                                {openCount} Open
                            </button>
                            <button
                                onClick={() => setFilter("closed")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === "closed"
                                        ? "bg-muted text-muted-foreground border border-border"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                                    }`}
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                {closedCount} Closed
                            </button>
                        </div>

                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <button className="flex items-center gap-1 hover:text-foreground transition-colors">
                                <User className="h-3.5 w-3.5" />
                                Author
                            </button>
                            <button className="flex items-center gap-1 hover:text-foreground transition-colors">
                                <Tag className="h-3.5 w-3.5" />
                                Label
                            </button>
                            <button className="flex items-center gap-1 hover:text-foreground transition-colors">
                                <ArrowUpDown className="h-3.5 w-3.5" />
                                Sort
                            </button>
                        </div>
                    </div>

                    {/* PRs List */}
                    <div className="divide-y divide-border">
                        <AnimatePresence mode="popLayout">
                            {filteredPRs.length > 0 ? (
                                filteredPRs.map((pr, index) => {
                                    const { icon: Icon, color, bg } = getPRIcon(pr.state, pr.isDraft);
                                    return (
                                        <motion.a
                                            key={pr.id}
                                            href={`/${repoOwner}/${repoName}/pulls/${pr.number}`}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            transition={{ delay: index * 0.03 }}
                                            className="flex items-start gap-3 p-4 hover:bg-accent/50 transition-colors group"
                                        >
                                            {pr.state === "open" && (
                                                <button
                                                    type="button"
                                                    aria-label={`Select PR #${pr.number}`}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        toggleSelectPr(pr.id);
                                                    }}
                                                    className={`mt-1 h-4 w-4 rounded border ${selectedPrIds.includes(pr.id)
                                                        ? "border-primary bg-primary/20"
                                                        : "border-border bg-transparent"
                                                        }`}
                                                />
                                            )}
                                            {/* Status Icon */}
                                            <div className="mt-0.5">
                                                <div className={`p-1 rounded-md ${bg}`}>
                                                    <Icon className={`h-4 w-4 ${color}`} />
                                                </div>
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                                        {pr.title}
                                                    </span>
                                                    {pr.isDraft && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                                                            Draft
                                                        </span>
                                                    )}
                                                    {/* Labels */}
                                                    {pr.labels?.map(label => (
                                                        <span
                                                            key={label.name}
                                                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                                            style={{
                                                                backgroundColor: `${label.color}20`,
                                                                color: label.color,
                                                                border: `1px solid ${label.color}40`
                                                            }}
                                                        >
                                                            {label.name}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                                    <span>#{pr.number}</span>
                                                    <span>•</span>
                                                    <span>opened {timeAgo(pr.createdAt)}</span>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1">
                                                        {pr.author.avatarUrl ? (
                                                            <img
                                                                src={pr.author.avatarUrl}
                                                                alt=""
                                                                className="h-4 w-4 rounded-full"
                                                            />
                                                        ) : (
                                                            <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-[8px] text-primary font-bold">
                                                                {pr.author.username[0].toUpperCase()}
                                                            </div>
                                                        )}
                                                        <span className="hover:text-primary transition-colors">
                                                            {pr.author.username}
                                                        </span>
                                                    </span>
                                                    {pr.sourceBranch && pr.targetBranch && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="flex items-center gap-1 text-muted-foreground">
                                                                <GitBranch className="h-3 w-3" />
                                                                <code className="text-primary">{pr.sourceBranch}</code>
                                                                <span>→</span>
                                                                <code className="text-muted-foreground">{pr.targetBranch}</code>
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Comment Count */}
                                            {pr.commentCount > 0 && (
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                                                    <MessageSquare className="h-4 w-4" />
                                                    {pr.commentCount}
                                                </div>
                                            )}
                                        </motion.a>
                                    );
                                })
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="p-12 text-center"
                                >
                                    <GitPullRequest className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-foreground mb-2">
                                        {searchQuery ? "No matching pull requests" : "Welcome to pull requests!"}
                                    </h3>
                                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                                        {searchQuery
                                            ? "Try adjusting your search or filter to find what you're looking for."
                                            : "Pull requests help you collaborate on code with others. When you're ready, you can merge your code into the main branch."}
                                    </p>
                                    {!searchQuery && (
                                        <motion.a
                                            href={`/${repoOwner}/${repoName}/compare`}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 transition-all"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Create the first pull request
                                        </motion.a>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
