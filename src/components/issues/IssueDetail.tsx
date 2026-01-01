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
    Trash2
} from "lucide-react";
import { useState } from "react";

interface Issue {
    id: string;
    number: number;
    title: string;
    body: string;
    state: "open" | "closed";
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
}

interface Props {
    issue: Issue;
    bodyHtml: string;
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

export default function IssueDetail({ issue, bodyHtml, repoOwner, repoName }: Props) {
    const [showMenu, setShowMenu] = useState(false);

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

                <div className="flex items-center gap-3 text-sm">
                    {/* Status Badge */}
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

                    <span className="text-gray-400">
                        <span className="font-medium text-white hover:text-cyan-400 cursor-pointer transition-colors">
                            {issue.author.username}
                        </span>
                        {" "}opened this issue {timeAgo(issue.createdAt)}
                    </span>
                </div>
            </motion.div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
                {/* Left Column - Issue Body & Comments */}
                <div className="space-y-6">
                    {/* Issue Body Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="relative"
                    >
                        {/* Gradient border */}
                        <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500/20 via-transparent to-purple-500/20 rounded-xl opacity-50" />

                        <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/80 backdrop-blur-sm overflow-hidden">
                            {/* Author Header */}
                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    {issue.author.avatarUrl ? (
                                        <img
                                            src={issue.author.avatarUrl}
                                            alt=""
                                            className="h-8 w-8 rounded-full ring-2 ring-white/10"
                                        />
                                    ) : (
                                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-sm font-bold text-white ring-2 ring-white/10">
                                            {issue.author.username[0].toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <span className="font-medium text-white text-sm">
                                            {issue.author.username}
                                        </span>
                                        <span className="text-xs text-gray-500 ml-2">
                                            commented {timeAgo(issue.createdAt)}
                                        </span>
                                    </div>
                                </div>

                                {/* Actions Menu */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowMenu(!showMenu)}
                                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                    >
                                        <MoreHorizontal className="h-4 w-4 text-gray-500" />
                                    </button>

                                    {showMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-white/10 bg-[#161b22] shadow-xl z-10"
                                        >
                                            <div className="p-1">
                                                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-md transition-colors">
                                                    <Link2 className="h-4 w-4" />
                                                    Copy link
                                                </button>
                                                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-md transition-colors">
                                                    <Pin className="h-4 w-4" />
                                                    Pin issue
                                                </button>
                                                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-md transition-colors">
                                                    <Lock className="h-4 w-4" />
                                                    Lock conversation
                                                </button>
                                                <div className="border-t border-white/5 my-1" />
                                                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-md transition-colors">
                                                    <Trash2 className="h-4 w-4" />
                                                    Delete issue
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </div>

                            {/* Body Content */}
                            <div
                                className="p-5 prose prose-invert prose-sm max-w-none prose-p:text-gray-300 prose-headings:text-white prose-a:text-cyan-400 prose-code:text-pink-400 prose-pre:bg-black/30"
                                dangerouslySetInnerHTML={{ __html: bodyHtml }}
                            />
                        </div>
                    </motion.div>

                    {/* Add Comment Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="relative"
                    >
                        <div className="rounded-xl border border-white/10 bg-[#0d1117]/80 p-4">
                            <textarea
                                placeholder="Leave a comment..."
                                className="w-full h-24 bg-transparent border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50 resize-none"
                            />
                            <div className="flex justify-end mt-3">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-sm font-medium text-white shadow-lg shadow-green-500/20"
                                >
                                    <MessageSquare className="h-4 w-4" />
                                    Comment
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Right Sidebar */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 }}
                    className="space-y-6"
                >
                    {/* Assignees */}
                    <div className="relative">
                        <div className="absolute -inset-[1px] bg-gradient-to-b from-cyan-500/10 to-transparent rounded-xl opacity-50" />
                        <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/60 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <User className="h-4 w-4 text-cyan-400" />
                                    Assignees
                                </h3>
                                <button className="text-xs text-gray-500 hover:text-cyan-400 transition-colors">
                                    Edit
                                </button>
                            </div>
                            {issue.assignees && issue.assignees.length > 0 ? (
                                <div className="space-y-2">
                                    {issue.assignees.map(assignee => (
                                        <div key={assignee.username} className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-xs font-bold text-white">
                                                {assignee.username[0].toUpperCase()}
                                            </div>
                                            <span className="text-sm text-gray-300">{assignee.username}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">No one assigned</p>
                            )}
                        </div>
                    </div>

                    {/* Labels */}
                    <div className="relative">
                        <div className="absolute -inset-[1px] bg-gradient-to-b from-purple-500/10 to-transparent rounded-xl opacity-50" />
                        <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/60 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <Tag className="h-4 w-4 text-purple-400" />
                                    Labels
                                </h3>
                                <button className="text-xs text-gray-500 hover:text-purple-400 transition-colors">
                                    Edit
                                </button>
                            </div>
                            {issue.labels && issue.labels.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {issue.labels.map(label => (
                                        <span
                                            key={label.name}
                                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
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
                            ) : (
                                <p className="text-sm text-gray-500">None yet</p>
                            )}
                        </div>
                    </div>

                    {/* Development */}
                    <div className="relative">
                        <div className="absolute -inset-[1px] bg-gradient-to-b from-orange-500/10 to-transparent rounded-xl opacity-50" />
                        <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/60 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <GitBranch className="h-4 w-4 text-orange-400" />
                                    Development
                                </h3>
                            </div>
                            <p className="text-sm text-gray-500">
                                No branches or pull requests linked
                            </p>
                        </div>
                    </div>

                    {/* Timeline Info */}
                    <div className="relative">
                        <div className="absolute -inset-[1px] bg-gradient-to-b from-green-500/10 to-transparent rounded-xl opacity-50" />
                        <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/60 p-4">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                                <Clock className="h-4 w-4 text-green-400" />
                                Timeline
                            </h3>
                            <div className="space-y-2 text-sm text-gray-500">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>Created {timeAgo(issue.createdAt)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
