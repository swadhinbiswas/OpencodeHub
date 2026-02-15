"use client";
import { motion } from "framer-motion";
import {
    AlertCircle,
    CheckCircle2,
    MessageSquare,
    User,
    Tag,
    Calendar,
    Clock,
    Link2,
    GitBranch,
    MoreHorizontal,
    Edit3,
    Pin,
    Lock,
    Trash2,
    Layers,
    CheckSquare,
    ListTodo
} from "lucide-react";
import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { formatDistanceToNow } from "date-fns";

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

export default function IssueDetail({ issue, bodyHtml, repoOwner, repoName, canLink }: Props) {
    const [showMenu, setShowMenu] = useState(false);
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
                if (isMounted) {
                    setLinkedPRs([]);
                }
            } finally {
                if (isMounted) {
                    setLoadingLinks(false);
                }
            }
        }

        loadLinks();

        return () => {
            isMounted = false;
        };
    }, [repoOwner, repoName, issue.number]);

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
                if (isMounted) {
                    setCrossRepoLinks([]);
                }
            } finally {
                if (isMounted) {
                    setLoadingCrossRepo(false);
                }
            }
        }

        loadCrossRepoLinks();

        return () => {
            isMounted = false;
        };
    }, [repoOwner, repoName, issue.number]);

    async function handleCrossRepoLink() {
        if (!crossRepoTarget.trim()) return;
        setCrossRepoError(null);
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
        }
    }

    return (
        <div className="max-w-6xl mx-auto">
            {/* Title Section */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 pb-6 border-b border-white/10"
            >
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl md:text-3xl font-bold text-white">
                            {issue.title}
                        </h1>
                        <span className="text-2xl md:text-3xl text-gray-500 font-light">
                            #{issue.number}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Convert to Epic Button */}
                        {issue.type !== 'epic' && (
                            <button
                                onClick={convertToEpic}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 text-sm text-purple-300 hover:bg-purple-500/20 transition-all"
                            >
                                <Layers className="h-4 w-4" />
                                convert to Epic
                            </button>
                        )}

                        {/* Edit Button */}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-gray-300 hover:bg-white/10 transition-all"
                        >
                            <Edit3 className="h-4 w-4" />
                            Edit
                        </motion.button>
                    </div>
                </div>

                {/* Status & Type Badges */}
                <div className="flex items-center gap-2">
                    {issue.status ? (
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium text-white border"
                            style={{
                                backgroundColor: `${issue.status.color}20`,
                                borderColor: `${issue.status.color}40`,
                                color: issue.status.color
                            }}
                        >
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: issue.status.color }} />
                            {issue.status.name}
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium ${issue.state === "open"
                                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                }`}
                        >
                            {issue.state === "open" ? (
                                <AlertCircle className="h-4 w-4" />
                            ) : (
                                <CheckCircle2 className="h-4 w-4" />
                            )}
                            {issue.state === "open" ? "Open" : "Closed"}
                        </motion.div>
                    )}

                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium border ${issue.type === 'epic'
                        ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                        : issue.type === 'task'
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                        }`}>
                        {issue.type === 'epic' && <Layers className="h-3.5 w-3.5" />}
                        {issue.type === 'task' && <CheckSquare className="h-3.5 w-3.5" />}
                        {issue.type === 'issue' && <AlertCircle className="h-3.5 w-3.5" />}
                        <span className="capitalize">{issue.type}</span>
                    </div>
                </div>

                <span className="text-gray-400">
                    <span className="font-medium text-white hover:text-cyan-400 cursor-pointer transition-colors">
                        {issue.author.username}
                    </span>
                    {" "}opened this issue {timeAgo(issue.createdAt)}
                </span>
            </motion.div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
                {/* Left Column - Issue Body & Comments */}
                <div className="space-y-6">
                    <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                </div>

                {/* Right Sidebar */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 }}
                    className="space-y-6"
                >
                    <div className="relative">
                        <div className="absolute -inset-[1px] bg-gradient-to-b from-emerald-500/10 to-transparent rounded-xl opacity-50" />
                        <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/60 p-4">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                                <Link2 className="h-4 w-4 text-emerald-400" />
                                Linked Issues
                            </h3>
                            {loadingCrossRepo ? (
                                <div className="text-xs text-gray-500">Loading...</div>
                            ) : crossRepoLinks.length === 0 ? (
                                <div className="text-xs text-gray-500">No linked issues</div>
                            ) : (
                                <div className="space-y-2">
                                    {crossRepoLinks.map((link) => (
                                        <a
                                            key={link.id}
                                            href={`/${link.repository.owner}/${link.repository.name}/issues/${link.issue.number}`}
                                            className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10"
                                        >
                                            <span>
                                                {link.repository.owner}/{link.repository.name}#{link.issue.number} {link.issue.title}
                                            </span>
                                            <span className="text-[10px] uppercase text-gray-500">
                                                {link.linkType}
                                            </span>
                                        </a>
                                    ))}
                                </div>
                            )}
                            {canLink && (
                                <div className="mt-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={crossRepoTarget}
                                            onChange={(e) => setCrossRepoTarget(e.target.value)}
                                            placeholder="owner/repo#123"
                                            className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
                                        />
                                        <select
                                            value={crossRepoType}
                                            onChange={(e) => setCrossRepoType(e.target.value)}
                                            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
                                        >
                                            <option value="relates">Relates</option>
                                            <option value="blocks">Blocks</option>
                                            <option value="blocked_by">Blocked by</option>
                                            <option value="duplicates">Duplicates</option>
                                        </select>
                                    </div>
                                    <button
                                        onClick={handleCrossRepoLink}
                                        className="w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20"
                                    >
                                        Link issue
                                    </button>
                                    {crossRepoError && (
                                        <div className="text-xs text-red-400">{crossRepoError}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="relative">
                        <div className="absolute -inset-[1px] bg-gradient-to-b from-cyan-500/10 to-transparent rounded-xl opacity-50" />
                        <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/60 p-4">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                                <GitBranch className="h-4 w-4 text-cyan-400" />
                                Linked Pull Requests
                            </h3>
                            {loadingLinks ? (
                                <div className="text-xs text-gray-500">Loading...</div>
                            ) : linkedPRs.length === 0 ? (
                                <div className="text-xs text-gray-500">No linked pull requests</div>
                            ) : (
                                <div className="space-y-2">
                                    {linkedPRs.map((link) => (
                                        <a
                                            key={link.id}
                                            href={`/${repoOwner}/${repoName}/pulls/${link.pullRequest.number}`}
                                            className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10"
                                        >
                                            <span>
                                                #{link.pullRequest.number} {link.pullRequest.title}
                                            </span>
                                            <span className="text-[10px] uppercase text-gray-500">
                                                {link.linkType}
                                            </span>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Sub-tasks / Child Issues */}
                    {(issue.type === 'epic' || (issue.children && issue.children.length > 0)) && (
                        <div className="relative">
                            <div className="absolute -inset-[1px] bg-gradient-to-b from-purple-500/10 to-transparent rounded-xl opacity-50" />
                            <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/60 p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <ListTodo className="h-4 w-4 text-purple-400" />
                                        {issue.type === 'epic' ? 'Child Issues' : 'Sub-tasks'}
                                    </h3>
                                    {issue.children && issue.children.length > 0 && (
                                        <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-gray-300">
                                            {issue.children.filter(c => c.state === 'closed').length} / {issue.children.length}
                                        </span>
                                    )}
                                </div>

                                {/* Progress Bar */}
                                {issue.children && issue.children.length > 0 && (
                                    <div className="h-1.5 w-full bg-white/10 rounded-full mb-3 overflow-hidden">
                                        <div
                                            className="h-full bg-purple-500 transition-all duration-500"
                                            style={{
                                                width: `${(issue.children.filter(c => c.state === 'closed').length / issue.children.length) * 100}%`
                                            }}
                                        />
                                    </div>
                                )}

                                <div className="space-y-1">
                                    {issue.children && issue.children.map(child => (
                                        <a
                                            key={child.number}
                                            href={`/${repoOwner}/${repoName}/issues/${child.number}`}
                                            className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors group"
                                        >
                                            <div className="mt-0.5">
                                                {child.state === "open" ? (
                                                    <AlertCircle className="h-3.5 w-3.5 text-green-500" />
                                                ) : (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-purple-500" />
                                                )}
                                            </div>
                                            <div className="text-sm min-w-0">
                                                <div className="text-gray-300 group-hover:text-cyan-400 truncate transition-colors">
                                                    {child.title}
                                                </div>
                                            </div>
                                        </a>
                                    ))}

                                    {issue.type === 'epic' && (
                                        <a
                                            href={`/${repoOwner}/${repoName}/issues/new?parent=${issue.number}`}
                                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 text-sm text-gray-400 hover:text-cyan-400 transition-colors mt-2 border border-dashed border-white/10 hover:border-cyan-500/30 justify-center"
                                        >
                                            <ListTodo className="h-3.5 w-3.5" />
                                            Add sub-task
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
