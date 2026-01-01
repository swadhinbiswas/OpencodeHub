"use client";
import { HoverEffect } from "@/components/ui/card-hover-effect";
import { motion } from "framer-motion";
import {
    Code,
    GitBranch,
    Activity,
    Users,
    BookOpen,
    Settings,
    Layers,
    Bot,
    GitMerge,
    BarChart3,
    MessageSquare,
    Terminal,
} from "lucide-react";

const graphiteFeatures = [
    {
        title: "Stacked Pull Requests",
        description:
            "Break large changes into reviewable stacks. Each PR builds on the previous, enabling faster feedback cycles.",
        icon: <Layers className="h-6 w-6 text-primary" />,
        link: "/inbox",
    },
    {
        title: "AI Code Review",
        description:
            "Get instant feedback from AI reviewers. Catch bugs, suggest improvements, and enforce best practices automatically.",
        icon: <Bot className="h-6 w-6 text-purple-400" />,
    },
    {
        title: "Smart Merge Queue",
        description:
            "Stack-aware merge queue with automatic rebasing. Never deal with merge conflicts again.",
        icon: <GitMerge className="h-6 w-6 text-green-400" />,
    },
    {
        title: "Developer Metrics",
        description:
            "Track PR velocity, review efficiency, and team performance with actionable insights.",
        icon: <BarChart3 className="h-6 w-6 text-orange-400" />,
    },
    {
        title: "Slack Notifications",
        description:
            "Get actionable PR notifications in Slack. Review, approve, and merge without leaving chat.",
        icon: <MessageSquare className="h-6 w-6 text-blue-400" />,
    },
    {
        title: "och CLI",
        description:
            "Powerful CLI for managing stacks. Create, sync, and submit PRs from your terminal.",
        icon: <Terminal className="h-6 w-6 text-cyan-400" />,
    },
];

const coreFeatures = [
    {
        title: "Git Hosting",
        description:
            "Full Git support with SSH and HTTP protocols. Manage branches, tags, and commits with ease.",
        icon: <Code className="h-6 w-6 text-primary" />,
    },
    {
        title: "Pull Requests",
        description:
            "Review code changes with inline comments, approvals, and merge strategies.",
        icon: <GitBranch className="h-6 w-6 text-primary" />,
    },
    {
        title: "CI/CD Pipelines",
        description:
            "GitHub Actions compatible workflows. Build, test, and deploy automatically.",
        icon: <Activity className="h-6 w-6 text-primary" />,
    },
    {
        title: "Team Collaboration",
        description:
            "Collaborators, teams, and fine-grained permissions for enterprise workflows.",
        icon: <Users className="h-6 w-6 text-primary" />,
    },
    {
        title: "Documentation",
        description:
            "Built-in wiki, README rendering, and project documentation support.",
        icon: <BookOpen className="h-6 w-6 text-primary" />,
    },
    {
        title: "Administration",
        description:
            "Advanced controls, audit logs, and monitoring for system administrators.",
        icon: <Settings className="h-6 w-6 text-primary" />,
    },
];

export default function FeaturesSection() {
    return (
        <div className="py-20 relative">
            {/* Graphite Features */}
            <div className="max-w-7xl mx-auto px-4 mb-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center mb-10"
                >
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-sm text-primary mb-4">
                        ✨ New Features
                    </span>
                    <h2 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                        Graphite-Inspired Developer Experience
                    </h2>
                    <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                        Stack your PRs, automate reviews, and ship faster with our modern code review workflow
                    </p>
                </motion.div>

                <HoverEffect items={graphiteFeatures} />
            </div>

            {/* Core Features */}
            <div className="max-w-7xl mx-auto px-4 border-t border-white/5 pt-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center mb-10"
                >
                    <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                        Everything you need to ship code
                    </h2>
                    <p className="mt-4 text-muted-foreground">
                        A complete platform for version control, code review, and continuous integration
                    </p>
                </motion.div>

                <HoverEffect items={coreFeatures} />
            </div>
        </div>
    );
}
