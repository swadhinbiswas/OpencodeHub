"use client";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertCircle,
    CheckCircle2,
    MessageSquare,
    Search,
    Tag,
    Calendar,
    User,
    ArrowUpDown,
    Plus,
    Sparkles,
    Filter
} from "lucide-react";
import { useState } from "react";

interface Issue {
    id: string;
    number: number;
    title: string;
    state: "open" | "closed";
    createdAt: string;
    commentCount: number;
    author: {
        username: string;
        avatarUrl?: string;
    };
    labels?: Array<{
        name: string;
        color: string;
    }>;
}

interface Props {
    issues: Issue[];
    openCount: number;
    closedCount: number;
    repoOwner: string;
    repoName: string;
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

export default function IssuesList({ issues, openCount, closedCount, repoOwner, repoName }: Props) {
    const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
    const [searchQuery, setSearchQuery] = useState("");

    const filteredIssues = issues.filter(issue => {
        const matchesFilter = filter === "all" || issue.state === filter;
        const matchesSearch = issue.title.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    return (
        <div className="space-y-6">
            {/* Enhanced Header with Glow */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
                {/* Search Input with Glass Effect */}
                <div className="relative flex-1 max-w-xl group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <input
                            type="search"
                            placeholder="Search all issues..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                        />
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <motion.a
                        href={`/${repoOwner}/${repoName}/labels`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-gray-300 hover:bg-white/10 hover:border-white/20 transition-all"
                    >
                        <Tag className="h-4 w-4" />
                        Labels
                    </motion.a>
                    <motion.a
                        href={`/${repoOwner}/${repoName}/milestones`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-gray-300 hover:bg-white/10 hover:border-white/20 transition-all"
                    >
                        <Calendar className="h-4 w-4" />
                        Milestones
                    </motion.a>
                    <motion.a
                        href={`/${repoOwner}/${repoName}/issues/new`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-sm font-medium text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all"
                    >
                        <Plus className="h-4 w-4" />
                        New Issue
                    </motion.a>
                </div>
            </motion.div>

            {/* Issues Container with Glass Effect */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="relative"
            >
                {/* Gradient border effect */}
                <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500/30 via-purple-500/20 to-pink-500/30 rounded-xl blur-sm opacity-50" />

                <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/80 backdrop-blur-sm overflow-hidden">
                    {/* Filter Header */}
                    <div className="flex items-center justify-between gap-4 border-b border-white/5 bg-white/[0.02] px-4 py-3">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setFilter("open")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === "open"
                                        ? "bg-green-500/10 text-green-400 border border-green-500/30"
                                        : "text-gray-400 hover:text-white hover:bg-white/5"
                                    }`}
                            >
                                <AlertCircle className="h-4 w-4" />
                                {openCount} Open
                            </button>
                            <button
                                onClick={() => setFilter("closed")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === "closed"
                                        ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                                        : "text-gray-400 hover:text-white hover:bg-white/5"
                                    }`}
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                {closedCount} Closed
                            </button>
                        </div>

                        <div className="flex items-center gap-3 text-sm text-gray-500">
                            <button className="flex items-center gap-1 hover:text-white transition-colors">
                                <User className="h-3.5 w-3.5" />
                                Author
                            </button>
                            <button className="flex items-center gap-1 hover:text-white transition-colors">
                                <Tag className="h-3.5 w-3.5" />
                                Label
                            </button>
                            <button className="flex items-center gap-1 hover:text-white transition-colors">
                                <ArrowUpDown className="h-3.5 w-3.5" />
                                Sort
                            </button>
                        </div>
                    </div>

                    {/* Issues List */}
                    <div className="divide-y divide-white/5">
                        <AnimatePresence mode="popLayout">
                            {filteredIssues.length > 0 ? (
                                filteredIssues.map((issue, index) => (
                                    <motion.a
                                        key={issue.id}
                                        href={`/${repoOwner}/${repoName}/issues/${issue.number}`}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{ delay: index * 0.03 }}
                                        className="flex items-start gap-3 p-4 hover:bg-white/[0.02] transition-colors group"
                                    >
                                        {/* Status Icon */}
                                        <div className="mt-0.5">
                                            {issue.state === "open" ? (
                                                <div className="relative">
                                                    <AlertCircle className="h-5 w-5 text-green-500" />
                                                    <div className="absolute inset-0 bg-green-500 blur-md opacity-0 group-hover:opacity-30 transition-opacity" />
                                                </div>
                                            ) : (
                                                <div className="relative">
                                                    <CheckCircle2 className="h-5 w-5 text-purple-500" />
                                                    <div className="absolute inset-0 bg-purple-500 blur-md opacity-0 group-hover:opacity-30 transition-opacity" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-semibold text-white group-hover:text-cyan-400 transition-colors truncate">
                                                    {issue.title}
                                                </span>
                                                {/* Labels */}
                                                {issue.labels?.map(label => (
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
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span>#{issue.number}</span>
                                                <span>•</span>
                                                <span>opened {timeAgo(issue.createdAt)}</span>
                                                <span>•</span>
                                                <span className="flex items-center gap-1">
                                                    {issue.author.avatarUrl ? (
                                                        <img
                                                            src={issue.author.avatarUrl}
                                                            alt=""
                                                            className="h-4 w-4 rounded-full"
                                                        />
                                                    ) : (
                                                        <div className="h-4 w-4 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-[8px] text-white font-bold">
                                                            {issue.author.username[0].toUpperCase()}
                                                        </div>
                                                    )}
                                                    <span className="hover:text-cyan-400 transition-colors">
                                                        {issue.author.username}
                                                    </span>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Comment Count */}
                                        {issue.commentCount > 0 && (
                                            <div className="flex items-center gap-1 text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
                                                <MessageSquare className="h-4 w-4" />
                                                {issue.commentCount}
                                            </div>
                                        )}
                                    </motion.a>
                                ))
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="p-12 text-center"
                                >
                                    <div className="relative inline-block mb-4">
                                        <Sparkles className="h-12 w-12 text-cyan-400" />
                                        <div className="absolute inset-0 bg-cyan-500 blur-xl opacity-30" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-white mb-2">
                                        {searchQuery ? "No matching issues" : "Welcome to issues!"}
                                    </h3>
                                    <p className="text-gray-500 mb-6 max-w-md mx-auto">
                                        {searchQuery
                                            ? "Try adjusting your search or filter to find what you're looking for."
                                            : "Issues are used to track todos, bugs, feature requests, and more."}
                                    </p>
                                    {!searchQuery && (
                                        <motion.a
                                            href={`/${repoOwner}/${repoName}/issues/new`}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-sm font-medium text-white shadow-lg shadow-cyan-500/25"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Create the first issue
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
