import { motion } from "framer-motion";
import { GitCommit, GitMerge, CircleDot, Users, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
    stats: {
        commitsToday?: number;
        prsMerged?: number;
        issuesClosed?: number;
        activeUsers?: number;
    };
}

function AnimatedNumber({ value }: { value: number }) {
    const [display, setDisplay] = useState(0);

    useEffect(() => {
        const duration = 1000;
        const start = Date.now();
        const startVal = display;

        const tick = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.floor(startVal + (value - startVal) * eased));
            if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    }, [value]);

    return <>{display.toLocaleString()}</>;
}

const widgets = [
    {
        icon: GitCommit,
        label: "Commits Today",
        key: "commitsToday",
        color: "from-green-400 to-emerald-500",
        iconColor: "text-green-400",
        bgGlow: "bg-green-500/20"
    },
    {
        icon: GitMerge,
        label: "PRs Merged",
        key: "prsMerged",
        color: "from-purple-400 to-violet-500",
        iconColor: "text-purple-400",
        bgGlow: "bg-purple-500/20"
    },
    {
        icon: CircleDot,
        label: "Issues Closed",
        key: "issuesClosed",
        color: "from-orange-400 to-amber-500",
        iconColor: "text-orange-400",
        bgGlow: "bg-orange-500/20"
    },
    {
        icon: Users,
        label: "Active Users",
        key: "activeUsers",
        color: "from-cyan-400 to-blue-500",
        iconColor: "text-cyan-400",
        bgGlow: "bg-cyan-500/20"
    }
];

export default function QuickStatsRow({ stats }: Props) {
    // Use real data from API only, default to 0
    const data = {
        commitsToday: stats.commitsToday ?? 0,
        prsMerged: stats.prsMerged ?? 0,
        issuesClosed: stats.issuesClosed ?? 0,
        activeUsers: stats.activeUsers ?? 0
    };

    return (
        <div className="flex items-center justify-center gap-4">
            {widgets.map((widget, i) => {
                const Icon = widget.icon;
                const value = data[widget.key as keyof typeof data];

                return (
                    <motion.div
                        key={widget.key}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
                        className="relative group"
                    >
                        {/* Glow effect */}
                        <div className={`absolute -inset-1 ${widget.bgGlow} rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                        <div className="relative glass-panel rounded-xl px-4 py-3 flex items-center gap-3 hover:border-white/10 transition-colors cursor-default">
                            {/* Icon with gradient background */}
                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${widget.color} p-[1px]`}>
                                <div className="w-full h-full rounded-lg bg-[#0a0a15] flex items-center justify-center">
                                    <Icon className={`w-5 h-5 ${widget.iconColor}`} />
                                </div>
                            </div>

                            {/* Stats */}
                            <div>
                                <div className={`text-xl font-bold font-mono bg-gradient-to-r ${widget.color} bg-clip-text text-transparent`}>
                                    <AnimatedNumber value={value} />
                                </div>
                                <div className="text-[10px] uppercase tracking-wider text-gray-500">
                                    {widget.label}
                                </div>
                            </div>

                            {/* Trend indicator */}
                            <div className="ml-2">
                                <motion.div
                                    animate={{ y: [0, -2, 0] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                >
                                    <TrendingUp className={`w-3 h-3 ${widget.iconColor} opacity-60`} />
                                </motion.div>
                            </div>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
