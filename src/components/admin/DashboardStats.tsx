import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import { Database, GitPullRequest, Sparkles } from "lucide-react";

interface Props {
    stats: {
        totalRepos: number;
        collaborations: number;
    }
}

// Animated counter that smoothly transitions between numbers
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        const duration = 1500;
        const startTime = Date.now();
        const startValue = displayValue;

        const animate = () => {
            const now = Date.now();
            const progress = Math.min((now - startTime) / duration, 1);
            // Easing function for smooth animation
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayValue(Math.floor(startValue + (value - startValue) * eased));

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value]);

    return <span className={className}>{displayValue.toLocaleString()}</span>;
}

export default function DashboardStats({ stats }: Props) {
    return (
        <div className="flex flex-col gap-8 p-6">
            {/* Total Repositories - with glowing effect */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
                className="relative group"
            >
                {/* Glow effect on hover */}
                <div className="absolute -inset-2 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                        <Database className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-sm uppercase tracking-widest text-cyan-400/80">
                            Total Repositories
                        </h3>
                    </div>
                    <div className="text-5xl font-light font-mono">
                        <span className="bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
                            <AnimatedNumber value={stats.totalRepos} />
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                        <motion.span
                            className="relative flex h-2 w-2"
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        >
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                        </motion.span>
                        <span className="text-xs text-cyan-400/60">Live Count</span>
                    </div>
                </div>
            </motion.div>

            {/* Active Collaborations - with pink/rose theme */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="relative group"
            >
                {/* Glow effect on hover */}
                <div className="absolute -inset-2 bg-gradient-to-r from-pink-500/20 via-rose-500/20 to-orange-500/20 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                        <GitPullRequest className="w-4 h-4 text-rose-400" />
                        <h3 className="text-sm uppercase tracking-widest text-rose-400/80">
                            Active Collaborations
                        </h3>
                    </div>
                    <div className="text-5xl font-light font-mono">
                        <span className="bg-gradient-to-r from-rose-200 via-pink-300 to-rose-400 bg-clip-text text-transparent">
                            <AnimatedNumber value={stats.collaborations} />
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                        <Sparkles className="w-3 h-3 text-rose-400/60" />
                        <span className="text-xs text-rose-400/60">Pull Requests</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
