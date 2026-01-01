"use client";
import { motion, AnimatePresence } from "framer-motion";
import {
    Target,
    Calendar,
    CheckCircle2,
    Circle,
    Plus,
    Clock,
    AlertCircle,
    Milestone,
    TrendingUp,
    MoreHorizontal,
    Edit3,
    Trash2,
    Archive
} from "lucide-react";
import { useState } from "react";

interface MilestoneItem {
    id: string;
    title: string;
    description?: string;
    dueDate?: string;
    state: "open" | "closed";
    openIssues: number;
    closedIssues: number;
    progress: number;
}

interface Props {
    milestones: MilestoneItem[];
    repoOwner: string;
    repoName: string;
}

function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function getDaysRemaining(dueDate: string): { text: string; color: string } {
    const now = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: `${Math.abs(diffDays)} days overdue`, color: "text-red-400" };
    if (diffDays === 0) return { text: "Due today", color: "text-orange-400" };
    if (diffDays <= 7) return { text: `${diffDays} days left`, color: "text-yellow-400" };
    return { text: `${diffDays} days left`, color: "text-green-400" };
}

export default function MilestonesList({ milestones, repoOwner, repoName }: Props) {
    const [filter, setFilter] = useState<"open" | "closed">("open");
    const [showMenu, setShowMenu] = useState<string | null>(null);

    const filteredMilestones = milestones.filter(m => m.state === filter);
    const openCount = milestones.filter(m => m.state === "open").length;
    const closedCount = milestones.filter(m => m.state === "closed").length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
                            <Target className="h-6 w-6 text-purple-400" />
                        </div>
                        Milestones
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Track progress and manage project goals
                    </p>
                </div>

                <motion.a
                    href={`/${repoOwner}/${repoName}/milestones/new`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-sm font-medium text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all"
                >
                    <Plus className="h-4 w-4" />
                    New Milestone
                </motion.a>
            </motion.div>

            {/* Filter Tabs */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-2"
            >
                <button
                    onClick={() => setFilter("open")}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === "open"
                            ? "bg-green-500/10 text-green-400 border border-green-500/30"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                        }`}
                >
                    <AlertCircle className="h-4 w-4" />
                    {openCount} Open
                </button>
                <button
                    onClick={() => setFilter("closed")}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === "closed"
                            ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                        }`}
                >
                    <CheckCircle2 className="h-4 w-4" />
                    {closedCount} Closed
                </button>
            </motion.div>

            {/* Milestones List */}
            <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                    {filteredMilestones.length > 0 ? (
                        filteredMilestones.map((milestone, index) => (
                            <motion.div
                                key={milestone.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ delay: index * 0.05 }}
                                className="relative group"
                            >
                                {/* Gradient border */}
                                <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500/20 via-transparent to-pink-500/20 rounded-xl opacity-50 group-hover:opacity-100 transition-opacity" />

                                <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/80 backdrop-blur-sm p-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            {/* Title */}
                                            <a
                                                href={`/${repoOwner}/${repoName}/milestones/${milestone.id}`}
                                                className="text-lg font-semibold text-white hover:text-purple-400 transition-colors"
                                            >
                                                {milestone.title}
                                            </a>

                                            {/* Description */}
                                            {milestone.description && (
                                                <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                                                    {milestone.description}
                                                </p>
                                            )}

                                            {/* Meta Info */}
                                            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                                                {milestone.dueDate && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3.5 w-3.5" />
                                                        Due {formatDate(milestone.dueDate)}
                                                    </span>
                                                )}
                                                {milestone.dueDate && (
                                                    <span className={`flex items-center gap-1 ${getDaysRemaining(milestone.dueDate).color}`}>
                                                        <Clock className="h-3.5 w-3.5" />
                                                        {getDaysRemaining(milestone.dueDate).text}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions Menu */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowMenu(showMenu === milestone.id ? null : milestone.id)}
                                                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                            >
                                                <MoreHorizontal className="h-4 w-4 text-gray-500" />
                                            </button>

                                            {showMenu === milestone.id && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-white/10 bg-[#161b22] shadow-xl z-10"
                                                >
                                                    <div className="p-1">
                                                        <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-md">
                                                            <Edit3 className="h-4 w-4" />
                                                            Edit
                                                        </button>
                                                        <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-md">
                                                            <Archive className="h-4 w-4" />
                                                            Close
                                                        </button>
                                                        <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-md">
                                                            <Trash2 className="h-4 w-4" />
                                                            Delete
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Progress Section */}
                                    <div className="mt-4">
                                        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                            <span className="flex items-center gap-3">
                                                <span className="flex items-center gap-1 text-green-400">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    {milestone.closedIssues} closed
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Circle className="h-3.5 w-3.5" />
                                                    {milestone.openIssues} open
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-1 text-purple-400">
                                                <TrendingUp className="h-3.5 w-3.5" />
                                                {milestone.progress}% complete
                                            </span>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${milestone.progress}%` }}
                                                transition={{ duration: 0.8, ease: "easeOut" }}
                                                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center py-16"
                        >
                            <div className="relative inline-block mb-4">
                                <Milestone className="h-16 w-16 text-purple-400" />
                                <div className="absolute inset-0 bg-purple-500 blur-xl opacity-30" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">
                                {filter === "closed" ? "No closed milestones" : "No milestones yet"}
                            </h3>
                            <p className="text-gray-500 mb-6 max-w-md mx-auto">
                                {filter === "closed"
                                    ? "Closed milestones will appear here."
                                    : "Milestones help you track progress on groups of issues and pull requests."}
                            </p>
                            {filter === "open" && (
                                <motion.a
                                    href={`/${repoOwner}/${repoName}/milestones/new`}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-sm font-medium text-white shadow-lg shadow-purple-500/25"
                                >
                                    <Plus className="h-4 w-4" />
                                    Create a milestone
                                </motion.a>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
