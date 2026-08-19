"use client";

import { motion } from "framer-motion";
import {
    AlertCircle,
    CheckCircle2,
    CircleDot,
    MessageSquare,
    Tag,
    Calendar,
    Link2,
    GitBranch,
    GitPullRequest,
    Edit3,
    Layers,
    CheckSquare,
    ListTodo,
    Users,
    Plus,
    Layout,
    ArrowUpRight,
    Lock,
    Send,
    Loader2
} from "lucide-react";
import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

interface Issue {
    id: string;
    number: number;
    title: string;
    body: string;
    state: "open" | "closed";
    status?: {
        id: string;
        name: string;
        color: string;
        type: string;
    };
    createdAt: string;
    author: {
        username: string;
        avatarUrl?: string;
    };
    assignees?: Array<{
        id?: string;
        username: string;
        avatarUrl?: string;
    }>;
    labels?: Array<{
        name: string;
        color: string;
    }>;
    type: string;
    parent?: {
        number: number;
        title: string;
        state: "open" | "closed";
    };
    children?: Array<{
        number: number;
        title: string;
        state: "open" | "closed";
    }>;
}

interface Props {
    issue: Issue;
    bodyHtml: string;
    repoOwner: string;
    repoName: string;
    canLink?: boolean;
    canEdit?: boolean;
    currentUser?: {
        id: string;
        username: string;
        avatarUrl?: string;
    };
}

interface Comment {
    id: string;
    body: string;
    createdAt: string;
    author: {
        id: string;
        username: string;
        displayName?: string;
        avatarUrl?: string;
    };
}

function formatTimeAgo(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
    
    if (diffSecs < 60) return "just now";
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? "minute" : "minutes"} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths} ${diffMonths === 1 ? "month" : "months"} ago`;
    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears} ${diffYears === 1 ? "year" : "years"} ago`;
}

export default function IssueDetail({
    issue,
    bodyHtml,
    repoOwner,
    repoName,
    canLink = false,
    canEdit = false,
    currentUser
}: Props) {
    const [issueState, setIssueState] = useState<"open" | "closed">(issue.state);
    const [collaborators, setCollaborators] = useState<Array<{ id: string; username: string }>>([]);
    const [linkedPRs, setLinkedPRs] = useState<Array<{
        id: string;
        linkType: string;
        pullRequest: { number: number; title: string; state: string };
    }>>([]);
    const [loadingLinks, setLoadingLinks] = useState(true);

    const [crossRepoLinks, setCrossRepoLinks] = useState<Array<{
        id: string;
        linkType: string;
        issue: { number: number; title: string; state: string };
        repository: { name: string; owner: string };
    }>>([]);
    const [loadingCrossRepo, setLoadingCrossRepo] = useState(true);
    const [crossRepoTarget, setCrossRepoTarget] = useState("");
    const [crossRepoType, setCrossRepoType] = useState("relates");
    const [crossRepoError, setCrossRepoError] = useState<string | null>(null);
    const [isLinking, setIsLinking] = useState(false);

    // Editing Issue Title/Body
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(issue.title);
    const [isEditingBody, setIsEditingBody] = useState(false);
    const [editBody, setEditBody] = useState(issue.body);
    const [currentBodyHtml, setCurrentBodyHtml] = useState(bodyHtml);
    const [saving, setSaving] = useState(false);

    // Comments State
    const [comments, setComments] = useState<Comment[]>([]);
    const [loadingComments, setLoadingComments] = useState(true);
    const [newComment, setNewComment] = useState("");
    const [commentTab, setCommentTab] = useState<"write" | "preview">("write");
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [isTogglingState, setIsTogglingState] = useState(false);

    // Fetch Comments
    const fetchComments = async () => {
        try {
            const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.number}/comments`);
            if (res.ok) {
                const data = await res.json();
                setComments(data.data || []);
            }
        } catch (e) {
            console.error("Failed to fetch comments", e);
        } finally {
            setLoadingComments(false);
        }
    };

    useEffect(() => {
        fetchComments();
    }, [repoOwner, repoName, issue.number]);

    // Load Linked PRs & Collaborators
    useEffect(() => {
        let isMounted = true;

        async function loadLinks() {
            try {
                const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.number}/linked-prs`);
                if (!res.ok) throw new Error("Failed to load linked PRs");
                const data = await res.json();
                if (isMounted) {
                    setLinkedPRs(data.links || []);
                }
            } catch (e) {
                if (isMounted) setLinkedPRs([]);
            } finally {
                if (isMounted) setLoadingLinks(false);
            }
        }

        loadLinks();

        if (canEdit) {
            fetch(`/api/repos/${repoOwner}/${repoName}/collaborators`)
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                    if (isMounted) setCollaborators(data?.data?.collaborators || data?.collaborators || []);
                })
                .catch(() => {});
        }

        return () => {
            isMounted = false;
        };
    }, [repoOwner, repoName, issue.number, canEdit]);

    // Load Cross Repo Links
    useEffect(() => {
        let isMounted = true;

        async function loadCrossRepoLinks() {
            try {
                const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.number}/cross-repo-links`);
                if (!res.ok) throw new Error("Failed to load linked issues");
                const data = await res.json();
                if (isMounted) {
                    setCrossRepoLinks(data.links || []);
                }
            } catch (e) {
                if (isMounted) setCrossRepoLinks([]);
            } finally {
                if (isMounted) setLoadingCrossRepo(false);
            }
        }

        loadCrossRepoLinks();

        return () => {
            isMounted = false;
        };
    }, [repoOwner, repoName, issue.number]);

    // Convert to Epic
    async function convertToEpic() {
        if (!confirm("Are you sure you want to convert this issue to an Epic?")) return;

        try {
            const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.number}`, {
                method: "PATCH",
                body: JSON.stringify({ type: "epic" }),
                headers: { "Content-Type": "application/json" }
            });

            if (res.ok) {
                window.location.reload();
            } else {
                alert("Failed to convert to epic");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to convert to epic");
        }
    }

    // Toggle Issue State (Open / Closed)
    async function handleToggleIssueState() {
        const nextState = issueState === "open" ? "closed" : "open";
        setIsTogglingState(true);
        try {
            const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.number}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ state: nextState })
            });

            if (res.ok) {
                setIssueState(nextState);
                fetchComments();
            } else {
                const data = await res.json().catch(() => null);
                alert(data?.error?.message || "Failed to update issue status");
            }
        } catch (e) {
            alert("Failed to update issue status");
        } finally {
            setIsTogglingState(false);
        }
    }

    // Assignee Toggle
    async function handleAssigneeToggle(assigneeId: string) {
        if (!assigneeId) return;
        const currentIds = (issue.assignees || []).map((a: any) => a.id || a.username);
        const isAssigned = currentIds.includes(assigneeId);
        const newIds = isAssigned
            ? currentIds.filter((id) => id !== assigneeId)
            : [...currentIds, assigneeId];
        try {
            const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.number}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assigneeIds: newIds })
            });
            if (res.ok) {
                window.location.reload();
            } else {
                const data = await res.json().catch(() => null);
                alert(data?.error?.message || "Failed to update assignees");
            }
        } catch (e) {
            alert("Failed to update assignees");
        }
    }

    // Link Cross-Repo Issue
    async function handleCrossRepoLink() {
        if (!crossRepoTarget.trim()) return;
        setCrossRepoError(null);
        setIsLinking(true);
        try {
            const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.number}/cross-repo-links`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target: crossRepoTarget.trim(), linkType: crossRepoType })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error?.message || "Failed to link issue");
            }

            const data = await res.json();
            setCrossRepoLinks((prev) => [data.link, ...prev]);
            setCrossRepoTarget("");
        } catch (e: any) {
            setCrossRepoError(e.message || "Failed to link issue");
        } finally {
            setIsLinking(false);
        }
    }

    // Save Title
    async function handleSaveTitle() {
        if (!editTitle.trim()) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.number}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: editTitle.trim() }),
            });
            if (!res.ok) throw new Error("Failed to update title");
            issue.title = editTitle.trim();
            setIsEditingTitle(false);
        } catch (e) {
            alert("Failed to save title");
        } finally {
            setSaving(false);
        }
    }

    // Save Body
    async function handleSaveBody() {
        setSaving(true);
        try {
            const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.number}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ description: editBody }),
            });
            if (!res.ok) throw new Error("Failed to update description");
            const rendered = marked.parse(editBody || "") as string;
            setCurrentBodyHtml(DOMPurify.sanitize(rendered));
            issue.body = editBody;
            setIsEditingBody(false);
        } catch (e) {
            alert("Failed to save description");
        } finally {
            setSaving(false);
        }
    }

    // Submit New Comment
    async function handleSubmitComment() {
        if (!newComment.trim()) return;
        setIsSubmittingComment(true);
        try {
            const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.number}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: newComment.trim() })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error?.message || "Failed to add comment");
            }

            const data = await res.json();
            if (data.data) {
                setComments((prev) => [...prev, data.data]);
            } else {
                fetchComments();
            }
            setNewComment("");
            setCommentTab("write");
        } catch (e: any) {
            alert(e.message || "Failed to post comment");
        } finally {
            setIsSubmittingComment(false);
        }
    }

    // Participants Set
    const participants = Array.from(
        new Set([
            issue.author.username,
            ...(issue.assignees?.map((a) => a.username) || []),
            ...comments.map((c) => c.author?.username).filter(Boolean)
        ])
    );

    return (
        <div className="w-full space-y-6">
            {/* Header Section */}
            <div className="pb-5 border-b border-border space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Title */}
                    <div className="flex-1 min-w-0">
                        {isEditingTitle ? (
                            <div className="flex items-center gap-2 max-w-2xl">
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="flex-1 text-xl sm:text-2xl font-bold text-foreground bg-background border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                                <button
                                    onClick={handleSaveTitle}
                                    disabled={saving}
                                    className="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditingTitle(false);
                                        setEditTitle(issue.title);
                                    }}
                                    className="px-3 py-1.5 rounded-md border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-baseline gap-2.5 flex-wrap">
                                <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight break-words">
                                    {issue.title}
                                </h1>
                                <span className="text-2xl sm:text-3xl text-muted-foreground font-light">
                                    #{issue.number}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Action CTAs */}
                    <div className="flex items-center gap-2 flex-shrink-0 self-start">
                        {canEdit && !isEditingTitle && (
                            <button
                                onClick={() => setIsEditingTitle(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors shadow-xs"
                            >
                                <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Edit</span>
                            </button>
                        )}
                        <a
                            href={`/${repoOwner}/${repoName}/issues/new`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs sm:text-sm font-medium transition-colors shadow-xs"
                        >
                            <Plus className="h-4 w-4" />
                            <span>New issue</span>
                        </a>
                    </div>
                </div>

                {/* Status Badge & Subtitle Bar */}
                <div className="flex items-center gap-3 flex-wrap text-xs sm:text-sm text-muted-foreground">
                    {/* State Badge */}
                    <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold text-xs text-white shadow-xs ${
                            issueState === "open" ? "bg-[#238636]" : "bg-[#8957e5]"
                        }`}
                    >
                        {issueState === "open" ? (
                            <>
                                <CircleDot className="h-3.5 w-3.5" />
                                <span>Open</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Closed</span>
                            </>
                        )}
                    </div>

                    {/* Type Badge */}
                    {issue.type === "epic" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            <Layers className="h-3 w-3" />
                            Epic
                        </span>
                    ) : issue.type === "task" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <CheckSquare className="h-3 w-3" />
                            Task
                        </span>
                    ) : null}

                    {/* Subtitle Details */}
                    <div>
                        <span className="font-semibold text-foreground">@{issue.author.username}</span>
                        {" "}opened this issue {formatTimeAgo(issue.createdAt)} · {comments.length} comment{comments.length === 1 ? "" : "s"}
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">
                {/* Left Column - Conversation Timeline */}
                <div className="space-y-6 relative before:absolute before:left-[19px] before:top-5 before:bottom-5 before:w-[2px] before:bg-border/60">
                    {/* 1. Original Issue Description Post */}
                    <div className="flex items-start gap-4 relative z-10">
                        {/* Author Avatar */}
                        <div className="flex-shrink-0">
                            {issue.author.avatarUrl ? (
                                <img
                                    src={issue.author.avatarUrl}
                                    alt={issue.author.username}
                                    className="h-10 w-10 rounded-full border border-border/80 object-cover bg-secondary"
                                />
                            ) : (
                                <div className="h-10 w-10 rounded-full bg-secondary border border-border/80 flex items-center justify-center font-bold text-sm text-foreground">
                                    {issue.author.username?.[0]?.toUpperCase() || "?"}
                                </div>
                            )}
                        </div>

                        {/* Comment Card */}
                        <div className="flex-1 min-w-0 rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm overflow-hidden shadow-xs">
                            {/* Card Header */}
                            <div className="bg-muted/30 border-b border-border/70 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-foreground">@{issue.author.username}</span>
                                    <span>commented {formatTimeAgo(issue.createdAt)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full border border-border/70 bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                        Author
                                    </span>
                                    {canEdit && !isEditingBody && (
                                        <button
                                            onClick={() => setIsEditingBody(true)}
                                            className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                                            title="Edit description"
                                        >
                                            <Edit3 className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Card Body */}
                            <div className="p-4 text-sm text-foreground leading-relaxed">
                                {isEditingBody ? (
                                    <div className="space-y-3">
                                        <textarea
                                            value={editBody}
                                            onChange={(e) => setEditBody(e.target.value)}
                                            className="w-full min-h-[160px] p-3 rounded-md border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                                            placeholder="Write your issue description in Markdown..."
                                        />
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => {
                                                    setIsEditingBody(false);
                                                    setEditBody(issue.body);
                                                }}
                                                className="px-3 py-1.5 rounded-md border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSaveBody}
                                                disabled={saving}
                                                className="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                                            >
                                                {saving ? "Saving..." : "Update comment"}
                                            </button>
                                        </div>
                                    </div>
                                ) : currentBodyHtml ? (
                                    <div
                                        className="prose dark:prose-invert max-w-none text-sm text-foreground/90 leading-relaxed break-words"
                                        dangerouslySetInnerHTML={{ __html: currentBodyHtml }}
                                    />
                                ) : (
                                    <p className="text-muted-foreground italic">No description provided.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 2. Comments Thread */}
                    {comments.map((comment) => {
                        const commentHtml = DOMPurify.sanitize(marked.parse(comment.body || "") as string);
                        const isAuthor = comment.author?.username === issue.author.username;
                        const isRepoOwner = comment.author?.username === repoOwner;

                        return (
                            <div key={comment.id} className="flex items-start gap-4 relative z-10">
                                {/* Author Avatar */}
                                <div className="flex-shrink-0">
                                    {comment.author?.avatarUrl ? (
                                        <img
                                            src={comment.author.avatarUrl}
                                            alt={comment.author.username}
                                            className="h-10 w-10 rounded-full border border-border/80 object-cover bg-secondary"
                                        />
                                    ) : (
                                        <div className="h-10 w-10 rounded-full bg-secondary border border-border/80 flex items-center justify-center font-bold text-sm text-foreground">
                                            {comment.author?.username?.[0]?.toUpperCase() || "?"}
                                        </div>
                                    )}
                                </div>

                                {/* Comment Box */}
                                <div className="flex-1 min-w-0 rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm overflow-hidden shadow-xs">
                                    {/* Header */}
                                    <div className="bg-muted/30 border-b border-border/70 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-semibold text-foreground">
                                                @{comment.author?.displayName || comment.author?.username}
                                            </span>
                                            <span>commented {formatTimeAgo(comment.createdAt)}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {isAuthor && (
                                                <span className="rounded-full border border-border/70 bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                                    Author
                                                </span>
                                            )}
                                            {isRepoOwner && (
                                                <span className="rounded-full border border-border/70 bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                                    Owner
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="p-4 text-sm text-foreground leading-relaxed">
                                        <div
                                            className="prose dark:prose-invert max-w-none text-sm text-foreground/90 leading-relaxed break-words"
                                            dangerouslySetInnerHTML={{ __html: commentHtml }}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* State change timeline marker if closed */}
                    {issueState === "closed" && (
                        <div className="flex items-center gap-3 pl-2 py-2 relative z-10">
                            <div className="h-8 w-8 rounded-full bg-[#8957e5] text-white flex items-center justify-center border-2 border-background shadow-xs">
                                <CheckCircle2 className="h-4 w-4" />
                            </div>
                            <span className="text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">This issue</span> was closed.
                            </span>
                        </div>
                    )}

                    {/* 3. Add Comment Composer */}
                    <div className="flex items-start gap-4 relative z-10 pt-2">
                        {/* Current User Avatar */}
                        <div className="flex-shrink-0">
                            {currentUser?.avatarUrl ? (
                                <img
                                    src={currentUser.avatarUrl}
                                    alt={currentUser.username}
                                    className="h-10 w-10 rounded-full border border-border/80 object-cover bg-secondary"
                                />
                            ) : (
                                <div className="h-10 w-10 rounded-full bg-secondary border border-border/80 flex items-center justify-center font-bold text-sm text-foreground">
                                    {currentUser?.username?.[0]?.toUpperCase() || "?"}
                                </div>
                            )}
                        </div>

                        {/* Composer Card */}
                        <div className="flex-1 min-w-0 rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm overflow-hidden shadow-xs">
                            {/* Tab Bar */}
                            <div className="bg-muted/30 border-b border-border/70 px-4 py-1.5 flex items-center gap-2">
                                <button
                                    onClick={() => setCommentTab("write")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                        commentTab === "write"
                                            ? "bg-secondary text-foreground font-semibold shadow-xs"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    Write
                                </button>
                                <button
                                    onClick={() => setCommentTab("preview")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                        commentTab === "preview"
                                            ? "bg-secondary text-foreground font-semibold shadow-xs"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    Preview
                                </button>
                            </div>

                            {/* Editor Area */}
                            <div className="p-3">
                                {commentTab === "write" ? (
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Leave a comment..."
                                        className="w-full min-h-[120px] p-2 text-sm bg-transparent border-0 focus:outline-none resize-y text-foreground placeholder:text-muted-foreground"
                                    />
                                ) : (
                                    <div className="min-h-[120px] p-2 text-sm">
                                        {newComment.trim() ? (
                                            <div
                                                className="prose dark:prose-invert max-w-none text-sm text-foreground/90 leading-relaxed break-words"
                                                dangerouslySetInnerHTML={{
                                                    __html: DOMPurify.sanitize(marked.parse(newComment) as string)
                                                }}
                                            />
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">Nothing to preview</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer / Actions Bar */}
                            <div className="bg-muted/20 border-t border-border/70 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                                <span className="text-[11px] text-muted-foreground">
                                    Markdown is supported
                                </span>

                                <div className="flex items-center gap-2">
                                    {canEdit && (
                                        <button
                                            onClick={handleToggleIssueState}
                                            disabled={isTogglingState}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-secondary text-xs font-medium text-foreground hover:bg-accent transition-colors shadow-xs disabled:opacity-50"
                                        >
                                            {isTogglingState ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : issueState === "open" ? (
                                                <>
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-purple-400" />
                                                    <span>Close issue</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CircleDot className="h-3.5 w-3.5 text-emerald-500" />
                                                    <span>Reopen issue</span>
                                                </>
                                            )}
                                        </button>
                                    )}

                                    <button
                                        onClick={handleSubmitComment}
                                        disabled={isSubmittingComment || !newComment.trim()}
                                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs sm:text-sm font-semibold transition-colors shadow-xs disabled:opacity-50"
                                    >
                                        {isSubmittingComment ? (
                                            <>
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                <span>Commenting...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Send className="h-3.5 w-3.5" />
                                                <span>Comment</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar */}
                <div className="space-y-5 text-xs">
                    {/* Assignees Section */}
                    <div className="pb-4 border-b border-border/70 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                Assignees
                            </span>
                        </div>

                        {issue.assignees && issue.assignees.length > 0 ? (
                            <div className="space-y-1.5">
                                {issue.assignees.map((a: any) => (
                                    <div key={a.id || a.username} className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            {a.avatarUrl ? (
                                                <img src={a.avatarUrl} alt={a.username} className="h-5 w-5 rounded-full object-cover" />
                                            ) : (
                                                <div className="h-5 w-5 rounded-full bg-secondary border border-border/70 flex items-center justify-center text-[10px] font-bold text-foreground">
                                                    {a.username?.[0]?.toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-foreground font-medium">@{a.username}</span>
                                        </div>
                                        {canEdit && (
                                            <button
                                                onClick={() => handleAssigneeToggle(a.id || a.username)}
                                                className="text-muted-foreground hover:text-foreground text-sm leading-none"
                                                title="Unassign"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No one assigned</p>
                        )}

                        {canEdit && collaborators.length > 0 && (
                            <select
                                className="w-full h-7 rounded-md border border-border/70 bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 mt-1"
                                value=""
                                onChange={(e) => handleAssigneeToggle(e.target.value)}
                            >
                                <option value="">Assign someone...</option>
                                {collaborators.map((c) => (
                                    <option key={c.id || c.username} value={c.id || c.username}>
                                        {c.username}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Labels Section */}
                    <div className="pb-4 border-b border-border/70 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                Labels
                            </span>
                        </div>
                        {issue.labels && issue.labels.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {issue.labels.map((l, idx) => (
                                    <span
                                        key={idx}
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border"
                                        style={{
                                            backgroundColor: `${l.color}15`,
                                            borderColor: `${l.color}40`,
                                            color: l.color
                                        }}
                                    >
                                        {l.name}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">None yet</p>
                        )}
                    </div>

                    {/* Projects Section */}
                    <div className="pb-4 border-b border-border/70 space-y-2">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Layout className="h-3.5 w-3.5 text-muted-foreground" />
                            Projects
                        </span>
                        <p className="text-muted-foreground">None yet</p>
                    </div>

                    {/* Milestone Section */}
                    <div className="pb-4 border-b border-border/70 space-y-2">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            Milestone
                        </span>
                        <p className="text-muted-foreground">No milestone</p>
                    </div>

                    {/* Linked Pull Requests */}
                    <div className="pb-4 border-b border-border/70 space-y-2">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />
                            Linked Pull Requests
                        </span>
                        {loadingLinks ? (
                            <p className="text-muted-foreground">Loading...</p>
                        ) : linkedPRs.length > 0 ? (
                            <div className="space-y-1.5">
                                {linkedPRs.map((link) => (
                                    <a
                                        key={link.id}
                                        href={`/${repoOwner}/${repoName}/pulls/${link.pullRequest.number}`}
                                        className="flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-accent/60 transition-colors group"
                                    >
                                        <span className="text-foreground font-medium group-hover:text-primary transition-colors truncate">
                                            #{link.pullRequest.number} {link.pullRequest.title}
                                        </span>
                                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No linked pull requests</p>
                        )}
                    </div>

                    {/* Linked Issues */}
                    <div className="pb-4 border-b border-border/70 space-y-2.5">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                            Linked Issues
                        </span>
                        {loadingCrossRepo ? (
                            <p className="text-muted-foreground">Loading...</p>
                        ) : crossRepoLinks.length > 0 ? (
                            <div className="space-y-1.5">
                                {crossRepoLinks.map((link) => (
                                    <a
                                        key={link.id}
                                        href={`/${link.repository.owner}/${link.repository.name}/issues/${link.issue.number}`}
                                        className="flex items-start justify-between gap-2 p-1.5 rounded-md hover:bg-accent/60 transition-colors group"
                                    >
                                        <span className="text-foreground font-medium group-hover:text-primary transition-colors truncate">
                                            {link.repository.owner}/{link.repository.name}#{link.issue.number} {link.issue.title}
                                        </span>
                                        <span className="text-[10px] uppercase font-semibold text-muted-foreground flex-shrink-0">
                                            {link.linkType}
                                        </span>
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No linked issues</p>
                        )}

                        {canLink && (
                            <div className="space-y-1.5 pt-1">
                                <div className="space-y-1.5">
                                    <input
                                        type="text"
                                        placeholder="owner/repo#123"
                                        value={crossRepoTarget}
                                        onChange={(e) => setCrossRepoTarget(e.target.value)}
                                        className="w-full h-7 rounded-md border border-border/70 bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                                    />
                                    <select
                                        value={crossRepoType}
                                        onChange={(e) => setCrossRepoType(e.target.value)}
                                        className="w-full h-7 rounded-md border border-border/70 bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                                    >
                                        <option value="relates">Relates</option>
                                        <option value="blocks">Blocks</option>
                                        <option value="blocked_by">Blocked by</option>
                                        <option value="cloned_from">Cloned from</option>
                                    </select>
                                </div>
                                {crossRepoError && (
                                    <p className="text-[11px] text-destructive">{crossRepoError}</p>
                                )}
                                <button
                                    onClick={handleCrossRepoLink}
                                    disabled={isLinking || !crossRepoTarget.trim()}
                                    className="w-full h-7 rounded-md border border-border bg-secondary hover:bg-accent text-foreground text-xs font-medium transition-colors disabled:opacity-50"
                                >
                                    {isLinking ? "Linking..." : "Link issue"}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Sub-tasks / Epics (if applicable) */}
                    {(issue.type === "epic" || (issue.children && issue.children.length > 0)) && (
                        <div className="pb-4 border-b border-border/70 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-foreground flex items-center gap-1.5">
                                    <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
                                    {issue.type === "epic" ? "Child Issues" : "Sub-tasks"}
                                </span>
                                {issue.children && issue.children.length > 0 && (
                                    <span className="text-[11px] text-muted-foreground font-mono">
                                        {issue.children.filter((c) => c.state === "closed").length}/{issue.children.length}
                                    </span>
                                )}
                            </div>
                            {issue.children && issue.children.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-purple-500 transition-all duration-300"
                                            style={{
                                                width: `${(issue.children.filter((c) => c.state === "closed").length / issue.children.length) * 100}%`
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-1 pt-1">
                                        {issue.children.map((child) => (
                                            <a
                                                key={child.number}
                                                href={`/${repoOwner}/${repoName}/issues/${child.number}`}
                                                className="flex items-center justify-between gap-2 text-muted-foreground hover:text-foreground py-0.5 truncate"
                                            >
                                                <span className="truncate">#{child.number} {child.title}</span>
                                                <span className="text-[10px] font-semibold uppercase">{child.state}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Participants Section */}
                    <div className="space-y-2">
                        <span className="font-semibold text-foreground">
                            {participants.length} participant{participants.length === 1 ? "" : "s"}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {participants.map((username) => (
                                <a
                                    key={username}
                                    href={`/u/${username}`}
                                    className="h-6 w-6 rounded-full bg-secondary border border-border/80 flex items-center justify-center text-[10px] font-bold text-foreground hover:border-primary transition-colors"
                                    title={username}
                                >
                                    {username?.[0]?.toUpperCase()}
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Epic Conversion Option if not epic */}
                    {canEdit && issue.type !== "epic" && (
                        <div className="pt-2">
                            <button
                                onClick={convertToEpic}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 text-xs font-medium text-purple-400 hover:bg-purple-500/20 transition-colors"
                            >
                                <Layers className="h-3.5 w-3.5" />
                                <span>Convert to Epic</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
