"use client";
import { motion } from "framer-motion";
import {
    Target,
    Calendar,
    FileText,
    ArrowLeft,
    Save,
    X
} from "lucide-react";
import { useState } from "react";

interface Props {
    repoOwner: string;
    repoName: string;
}

export default function NewMilestoneForm({ repoOwner, repoName }: Props) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        setIsSubmitting(true);

        try {
            const res = await fetch(`/api/repos/${repoOwner}/${repoName}/milestones`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || null,
                    dueOn: dueDate || null,
                }),
            });

            if (res.ok) {
                window.location.href = `/${repoOwner}/${repoName}/milestones`;
            } else {
                alert("Failed to create milestone");
            }
        } catch (error) {
            console.error("Error creating milestone:", error);
            alert("Failed to create milestone");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <a
                    href={`/${repoOwner}/${repoName}/milestones`}
                    className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to milestones
                </a>

                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
                        <Target className="h-6 w-6 text-purple-400" />
                    </div>
                    New Milestone
                </h1>
                <p className="text-gray-500 text-sm mt-2">
                    Create a milestone to track progress on a collection of issues and pull requests.
                </p>
            </motion.div>

            {/* Form */}
            <motion.form
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                onSubmit={handleSubmit}
                className="space-y-6"
            >
                {/* Title */}
                <div className="relative">
                    <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500/20 via-transparent to-pink-500/20 rounded-xl opacity-50" />
                    <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/80 backdrop-blur-sm p-6">
                        <label className="block text-sm font-medium text-white mb-2 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-purple-400" />
                            Title *
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Milestone title"
                            required
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                        />
                    </div>
                </div>

                {/* Due Date */}
                <div className="relative">
                    <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500/20 via-transparent to-blue-500/20 rounded-xl opacity-50" />
                    <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/80 backdrop-blur-sm p-6">
                        <label className="block text-sm font-medium text-white mb-2 flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-cyan-400" />
                            Due date (optional)
                        </label>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all [color-scheme:dark]"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            Set a target date for this milestone to track deadlines.
                        </p>
                    </div>
                </div>

                {/* Description */}
                <div className="relative">
                    <div className="absolute -inset-[1px] bg-gradient-to-r from-green-500/20 via-transparent to-emerald-500/20 rounded-xl opacity-50" />
                    <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/80 backdrop-blur-sm p-6">
                        <label className="block text-sm font-medium text-white mb-2 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-green-400" />
                            Description (optional)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe the goals of this milestone..."
                            rows={4}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-2 focus:ring-green-500/20 transition-all resize-none"
                        />
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4">
                    <a
                        href={`/${repoOwner}/${repoName}/milestones`}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-all"
                    >
                        <X className="h-4 w-4" />
                        Cancel
                    </a>
                    <motion.button
                        type="submit"
                        disabled={!title.trim() || isSubmitting}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-sm font-medium text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className="h-4 w-4" />
                        {isSubmitting ? "Creating..." : "Create Milestone"}
                    </motion.button>
                </div>
            </motion.form>
        </div>
    );
}
