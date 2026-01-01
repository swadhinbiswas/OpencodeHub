"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Bot, GitMerge, BarChart3, MessageSquare, Terminal as TerminalIcon, Check, X, Clock, ArrowRight } from "lucide-react";

const demos = [
    {
        id: "stacked-prs",
        title: "Stacked Pull Requests",
        icon: Layers,
        color: "from-blue-500 to-cyan-500",
        description: "Break large features into reviewable chunks",
        demo: {
            type: "stack-visualization",
            items: [
                { id: 1, title: "Add database schema", status: "merged", pr: "#123" },
                { id: 2, title: "Add authentication service", status: "approved", pr: "#124", dependsOn: 1 },
                { id: 3, title: "Add login UI", status: "review", pr: "#125", dependsOn: 2 },
            ],
        },
    },
    {
        id: "ai-review",
        title: "AI Code Review",
        icon: Bot,
        color: "from-purple-500 to-pink-500",
        description: "Get instant feedback from AI reviewers",
        demo: {
            type: "ai-feedback",
            issues: [
                { severity: "critical", line: 45, message: "SQL injection vulnerability detected", fix: "Use parameterized queries" },
                { severity: "warning", line: 128, message: "N+1 query in loop", fix: "Use batch loading" },
                { severity: "info", line: 87, message: "Consider adding error handling", fix: "Wrap in try-catch" },
            ],
        },
    },
    {
        id: "merge-queue",
        title: "Smart Merge Queue",
        icon: GitMerge,
        color: "from-green-500 to-emerald-500",
        description: "Stack-aware merging with CI optimization",
        demo: {
            type: "queue-status",
            queue: [
                { pr: "#125", title: "Login UI", status: "running", ci: 75 },
                { pr: "#124", title: "Auth service", status: "waiting", dependsOn: "#123" },
                { pr: "#123", title: "Database schema", status: "ready" },
            ],
        },
    },
    {
        id: "metrics",
        title: "Developer Metrics",
        icon: BarChart3,
        color: "from-orange-500 to-red-500",
        description: "Track velocity and review efficiency",
        demo: {
            type: "metrics-dashboard",
            data: {
                prsMerged: { value: 24, change: "+12%" },
                avgTimeToMerge: { value: "8.2h", change: "-3h" },
                stackUsage: { value: "65%", change: "+15%" },
                reviewTime: { value: "22min", change: "-5min" },
            },
        },
    },
    {
        id: "slack",
        title: "Slack Notifications",
        icon: MessageSquare,
        color: "from-indigo-500 to-blue-500",
        description: "Actionable notifications in Slack",
        demo: {
            type: "slack-message",
            message: {
                author: "swadhin",
                action: "opened",
                pr: "#125",
                title: "Add login UI",
                stack: ["#123", "#124", "#125"],
                stats: { files: 32, additions: 420, deletions: 18 },
            },
        },
    },
    {
        id: "cli",
        title: "OCH CLI",
        icon: TerminalIcon,
        color: "from-cyan-500 to-teal-500",
        description: "Powerful terminal workflow",
        demo: {
            type: "terminal",
            commands: [
                { cmd: "och stack create feature-name", output: "✓ Created branch stack/feature-name" },
                { cmd: "och stack submit", output: "✓ Pushed and created PR #125" },
                { cmd: "och queue add 125", output: "✓ Added to merge queue (position 1)" },
            ],
        },
    },
];

function StackVisualization({ items }: any) {
    return (
        <div className="space-y-2">
            <div className="text-xs text-muted-foreground pl-4">main (base)</div>
            {items.map((item: any, idx: number) => (
                <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-center gap-3">
                    <div className="w-8 flex flex-col items-center">
                        <div className="h-4 border-l-2 border-muted" />
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        {idx < items.length - 1 && <div className="h-12 border-l-2 border-dashed border-muted" />}
                    </div>
                    <div className="flex-1 p-3 rounded-lg border border-white/5 bg-card/50">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{item.pr}: {item.title}</span>
                            <span
                                className={`text-xs px-2 py-0.5 rounded-full ${item.status === "merged"
                                    ? "bg-green-500/20 text-green-400"
                                    : item.status === "approved"
                                        ? "bg-blue-500/20 text-blue-400"
                                        : "bg-yellow-500/20 text-yellow-400"
                                    }`}>
                                {item.status}
                            </span>
                        </div>
                        {item.dependsOn && (
                            <div className="text-xs text-muted-foreground">
                                Depends on PR #{items.find((i: any) => i.id === item.dependsOn)?.pr.slice(1)}
                            </div>
                        )}
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

function AIFeedback({ issues }: any) {
    const severityConfig: Record<string, { bg: string; text: string; icon: any }> = {
        critical: { bg: "bg-red-500/20", text: "text-red-400", icon: X },
        warning: { bg: "bg-yellow-500/20", text: "text-yellow-400", icon: Clock },
        info: { bg: "bg-blue-500/20", text: "text-blue-400", icon: Check },
    };

    return (
        <div className="space-y-3">
            {issues.map((issue: any, idx: number) => {
                const config = severityConfig[issue.severity];
                const Icon = config.icon;
                return (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.15 }}
                        className="p-3 rounded-lg border border-white/5 bg-card/50 space-y-2">
                        <div className="flex items-start gap-3">
                            <div className={`p-1.5 rounded ${config.bg}`}>
                                <Icon className={`h-4 w-4 ${config.text}`} />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-mono text-muted-foreground">Line {issue.line}</span>
                                    <span className={`text-xs uppercase font-semibold ${config.text}`}>
                                        {issue.severity}
                                    </span>
                                </div>
                                <p className="text-sm">{issue.message}</p>
                                <p className="text-xs text-muted-foreground mt-1">💡 {issue.fix}</p>
                            </div>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}

function QueueStatus({ queue }: any) {
    return (
        <div className="space-y-2">
            {queue.map((item: any, idx: number) => (
                <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-3 rounded-lg border border-white/5 bg-card/50">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <span className="text-sm font-medium">
                                {item.pr}: {item.title}
                            </span>
                        </div>
                        <span className="text-xs text-muted-foreground">Position {idx + 1}</span>
                    </div>
                    {item.status === "running" && item.ci !== undefined && (
                        <div>
                            <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground">⏳ Running CI</span>
                                <span className="text-primary">{item.ci}%</span>
                            </div>
                            <div className="h-1.5 bg-background rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${item.ci}%` }}
                                    transition={{ duration: 1.5 }}
                                    className="h-full bg-primary"
                                />
                            </div>
                        </div>
                    )}
                    {item.dependsOn && (
                        <div className="text-xs text-muted-foreground mt-1">⏸️ Waiting for {item.dependsOn}</div>
                    )}
                    {item.status === "ready" && <div className="text-xs text-green-400 mt-1">✅ Ready to merge</div>}
                </motion.div>
            ))}
        </div>
    );
}

function MetricsDashboard({ data }: any) {
    const metrics = [
        { label: "PRs Merged", key: "prsMerged" },
        { label: "Avg Time to Merge", key: "avgTimeToMerge" },
        { label: "Stack Usage", key: "stackUsage" },
        { label: "Review Time", key: "reviewTime" },
    ];

    return (
        <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric, idx) => (
                <motion.div
                    key={metric.key}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-4 rounded-lg border border-white/5 bg-card/50">
                    <div className="text-xs text-muted-foreground mb-2">{metric.label}</div>
                    <div className="text-2xl font-bold">{data[metric.key].value}</div>
                    <div className="text-xs text-green-400 mt-1">{data[metric.key].change}</div>
                </motion.div>
            ))}
        </div>
    );
}

function SlackMessage({ message }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-lg border border-white/5 bg-card/50 space-y-3">
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                    {message.author[0].toUpperCase()}
                </div>
                <div className="flex-1">
                    <div className="text-sm">
                        <span className="font-medium">{message.author}</span> <span className="text-muted-foreground">{message.action}</span>{" "}
                        <span className="font-medium">
                            {message.pr}: {message.title}
                        </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                        Stack: {message.stack.join(" → ")} • {message.stats.files} files • +{message.stats.additions}/-
                        {message.stats.deletions}
                    </div>
                </div>
            </div>
            <div className="flex gap-2">
                {["Approve", "Request Changes", "View PR", "Add to Queue"].map((action) => (
                    <button
                        key={action}
                        className="px-3 py-1.5 text-xs rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
                        {action}
                    </button>
                ))}
            </div>
        </motion.div>
    );
}

function Terminal({ commands }: any) {
    const [currentIndex, setCurrentIndex] = useState(0);

    if (!commands || commands.length === 0) {
        return null;
    }

    return (
        <div className="p-4 rounded-lg bg-black/80 border border-white/10 font-mono text-sm">
            <div className="flex items-center gap-2 mb-3">
                <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <span className="text-xs text-muted-foreground">zsh</span>
            </div>
            <AnimatePresence mode="wait">
                {commands.slice(0, currentIndex + 1).map((cmd: any, idx: number) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-1 mb-2">
                        <div className="text-primary">
                            <span className="text-green-400">$</span> {cmd.cmd}
                        </div>
                        <div className="text-muted-foreground text-xs">{cmd.output}</div>
                    </motion.div>
                ))}
            </AnimatePresence>
            {currentIndex < commands.length - 1 && (
                <button
                    onClick={() => setCurrentIndex((i) => i + 1)}
                    className="text-xs text-primary hover:text-primary/80 mt-2">
                    → Next command
                </button>
            )}
        </div>
    );
}

export default function FeatureDemosSection() {
    const [activeDemo, setActiveDemo] = useState(demos[0].id);

    const currentDemo = demos.find((d) => d.id === activeDemo)!;

    return (
        <section className="container py-20">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                    See It in <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">Action</span>
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                    Interactive demonstrations of our advanced features. Click each feature to see how it works.
                </p>
            </motion.div>

            {/* Feature Tabs */}
            <div className="flex flex-wrap justify-center gap-3 mb-8">
                {demos.map((demo) => {
                    const Icon = demo.icon;
                    const isActive = activeDemo === demo.id;
                    return (
                        <button
                            key={demo.id}
                            onClick={() => setActiveDemo(demo.id)}
                            className={`group relative px-4 py-3 rounded-lg border transition-all ${isActive
                                ? "border-primary/50 bg-primary/10"
                                : "border-white/5 bg-card/30 hover:border-white/20"
                                }`}>
                            <div className="flex items-center gap-2">
                                <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                                <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                                    {demo.title}
                                </span>
                            </div>
                            {isActive && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute inset-0 rounded-lg border border-primary bg-primary/5 -z-10"
                                    transition={{ type: "spring", duration: 0.5 }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Demo Display */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeDemo}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="max-w-4xl mx-auto">
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        {/* Description */}
                        <div>
                            <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${currentDemo.color} mb-4`}>
                                <currentDemo.icon className="h-8 w-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">{currentDemo.title}</h3>
                            <p className="text-muted-foreground mb-6">{currentDemo.description}</p>
                            <a
                                href="/docs"
                                className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors">
                                Learn more
                                <ArrowRight className="h-4 w-4" />
                            </a>
                        </div>

                        {/* Demo Component */}
                        <div className="rounded-xl border border-white/10 bg-card/50 backdrop-blur-sm p-6">
                            {currentDemo.demo.type === "stack-visualization" && (
                                <StackVisualization items={currentDemo.demo.items} />
                            )}
                            {currentDemo.demo.type === "ai-feedback" && <AIFeedback issues={currentDemo.demo.issues} />}
                            {currentDemo.demo.type === "queue-status" && <QueueStatus queue={currentDemo.demo.queue} />}
                            {currentDemo.demo.type === "metrics-dashboard" && (
                                <MetricsDashboard data={currentDemo.demo.data} />
                            )}
                            {currentDemo.demo.type === "slack-message" && <SlackMessage message={currentDemo.demo.message} />}
                            {currentDemo.demo.type === "terminal" && <Terminal commands={currentDemo.demo.commands} />}
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </section>
    );
}
