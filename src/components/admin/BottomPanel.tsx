import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code2, GitCommit, MessageSquare, Users, TrendingUp, TrendingDown, Sparkles, Globe } from "lucide-react";

interface Props {
    stats: any;
}

// Animated number component
function AnimatedNumber({ value, className, prefix = "", suffix = "" }: {
    value: number;
    className?: string;
    prefix?: string;
    suffix?: string;
}) {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        const duration = 1200;
        const startTime = Date.now();
        const startValue = displayValue;

        const animate = () => {
            const now = Date.now();
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayValue(Math.floor(startValue + (value - startValue) * eased));

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value]);

    return <span className={className}>{prefix}{displayValue.toLocaleString()}{suffix}</span>;
}

export default function BottomPanel({ stats }: Props) {
    const [activeSlide, setActiveSlide] = useState(0);

    const SLIDES = 4;

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveSlide((prev) => (prev + 1) % SLIDES);
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    const variants = {
        enter: { opacity: 0, y: 30, filter: "blur(10px)" },
        center: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: -30, filter: "blur(10px)" },
    };

    return (
        <div className="relative rounded-2xl h-48 overflow-hidden flex items-center w-full">
            {/* Animated gradient border */}
            <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-r from-cyan-500/50 via-purple-500/50 to-pink-500/50 animate-gradient-x bg-[length:200%_auto]">
                <div className="h-full w-full rounded-2xl bg-[#050510]" />
            </div>

            {/* Content */}
            <div className="relative h-full w-full p-6 glass-panel rounded-2xl">
                <AnimatePresence mode="wait">

                    {/* VIEW 1: Code Frequency */}
                    {activeSlide === 0 && (
                        <motion.div
                            key="code-freq"
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.5 }}
                            className="w-full h-full flex items-center justify-between px-8"
                        >
                            <div className="relative">
                                {/* Glow effect */}
                                <div className="absolute -inset-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl blur-xl" />

                                <div className="relative">
                                    <div className="text-xs uppercase tracking-widest text-emerald-400/60 mb-3 flex items-center gap-2">
                                        <Code2 className="h-4 w-4 text-emerald-400" />
                                        Code Lines Added / Deleted
                                    </div>
                                    <div className="flex items-end gap-5">
                                        <div className="flex items-center gap-2">
                                            <TrendingUp className="h-6 w-6 text-green-400" />
                                            <span className="text-5xl font-mono font-light bg-gradient-to-r from-green-300 to-emerald-400 bg-clip-text text-transparent">
                                                <AnimatedNumber value={stats.codeStats?.added || 124475} prefix="+" />
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <TrendingDown className="h-5 w-5 text-red-400 opacity-60" />
                                            <span className="text-3xl font-mono text-red-400/70 font-light">
                                                <AnimatedNumber value={stats.codeStats?.deleted || 48468} prefix="-" />
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-3 flex items-center gap-1.5">
                                        <Globe className="h-3 w-3" />
                                        Global repository statistics (Last 24h)
                                    </div>
                                </div>
                            </div>

                            {/* Contribution bars */}
                            <div className="flex gap-1 items-end h-24">
                                {Array.from({ length: 45 }).map((_, i) => {
                                    const height = Math.random() * 100;
                                    return (
                                        <motion.div
                                            key={i}
                                            className="w-1.5 rounded-full bg-gradient-to-t from-green-600 to-emerald-400"
                                            initial={{ height: 0 }}
                                            animate={{ height: `${height}%` }}
                                            transition={{
                                                delay: i * 0.02,
                                                duration: 0.8,
                                                ease: "easeOut"
                                            }}
                                            style={{ opacity: 0.3 + (height / 100) * 0.7 }}
                                        />
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* VIEW 2: Contribution Graph */}
                    {activeSlide === 1 && (
                        <motion.div
                            key="contrib-graph"
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.5 }}
                            className="w-full h-full flex flex-col justify-center px-8"
                        >
                            <div className="text-xs uppercase tracking-widest text-blue-400/60 mb-4 flex items-center gap-2">
                                <GitCommit className="h-4 w-4 text-blue-400" />
                                System-wide Contribution Graph
                            </div>
                            <div className="flex gap-1 flex-wrap justify-center">
                                {Array.from({ length: 168 }).map((_, i) => {
                                    const level = Math.floor(Math.random() * 5);
                                    const colors = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
                                    return (
                                        <motion.div
                                            key={i}
                                            className="w-3 h-3 rounded-sm"
                                            initial={{ opacity: 0, scale: 0 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: i * 0.005 }}
                                            style={{ backgroundColor: colors[level] }}
                                        />
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* VIEW 3: User Engagement */}
                    {activeSlide === 2 && (
                        <motion.div
                            key="engagement"
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.5 }}
                            className="w-full h-full flex items-center justify-between px-8"
                        >
                            <div className="relative">
                                <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-xl blur-xl" />
                                <div className="relative">
                                    <div className="text-xs uppercase tracking-widest text-purple-400/60 mb-3 flex items-center gap-2">
                                        <Users className="h-4 w-4 text-purple-400" />
                                        Users Reviewing & Commenting
                                    </div>
                                    <div className="text-5xl font-mono font-light bg-gradient-to-r from-purple-300 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                                        <AnimatedNumber value={stats.reviewStats?.count || 156} />
                                    </div>
                                    <div className="text-xs text-gray-500 mt-3 flex items-center gap-1.5">
                                        <Sparkles className="h-3 w-3 text-purple-400/60" />
                                        Active participants in code review
                                    </div>
                                </div>
                            </div>

                            {/* Timeline */}
                            <div className="flex-1 px-16 flex items-center justify-center relative">
                                <div className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
                                <div className="flex gap-10 relative z-10">
                                    {Array.from({ length: 6 }).map((_, i) => {
                                        const colors = ['#8957e5', '#238636', '#da3633', '#e3b341', '#3fb950', '#f778ba'];
                                        return (
                                            <motion.div
                                                key={i}
                                                className="h-4 w-4 rounded-full relative"
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ delay: 0.3 + i * 0.1, type: "spring" }}
                                                style={{ backgroundColor: colors[i % colors.length] }}
                                            >
                                                <div
                                                    className="absolute inset-0 rounded-full animate-ping"
                                                    style={{
                                                        backgroundColor: colors[i % colors.length],
                                                        animationDelay: `${i * 0.2}s`,
                                                        animationDuration: "2s"
                                                    }}
                                                />
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Avatars */}
                            <div className="flex items-center -space-x-3">
                                {(stats.reviewStats?.activeReviewers || Array.from({ length: 4 })).slice(0, 5).map((u: any, i: number) => (
                                    <motion.div
                                        key={i}
                                        className="h-12 w-12 rounded-full border-2 border-[#050510] overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"
                                        initial={{ scale: 0, x: 20 }}
                                        animate={{ scale: 1, x: 0 }}
                                        transition={{ delay: 0.2 + i * 0.1 }}
                                    >
                                        {u?.avatar ? (
                                            <img src={u.avatar} className="h-full w-full object-cover" />
                                        ) : (
                                            <span className="text-sm font-bold text-white">{String.fromCharCode(65 + i)}</span>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* VIEW 4: Languages */}
                    {activeSlide === 3 && (
                        <motion.div
                            key="languages"
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.5 }}
                            className="w-full h-full flex flex-col justify-center px-8"
                        >
                            <div className="text-xs uppercase tracking-widest text-orange-400/60 mb-4 flex items-center gap-2">
                                <MessageSquare className="h-4 w-4 text-orange-400" />
                                Usage by Language
                            </div>
                            <div className="space-y-3 max-w-4xl w-full">
                                {(stats.languages || []).map((lang: any, i: number) => (
                                    <div key={lang.name} className="flex items-center gap-4">
                                        <div className="w-24 text-sm text-gray-300 font-mono">{lang.name}</div>
                                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${lang.percentage}%` }}
                                                transition={{ delay: i * 0.15, duration: 0.8, ease: "easeOut" }}
                                                className="h-full rounded-full relative overflow-hidden"
                                                style={{ backgroundColor: lang.color }}
                                            >
                                                {/* Shimmer effect */}
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                                            </motion.div>
                                        </div>
                                        <div className="w-12 text-sm text-gray-400 text-right font-mono">{lang.percentage}%</div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>

                {/* Progress indicators with glow */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {[0, 1, 2, 3].map(i => (
                        <button
                            key={i}
                            onClick={() => setActiveSlide(i)}
                            className="relative"
                        >
                            {activeSlide === i && (
                                <motion.div
                                    layoutId="activeIndicator"
                                    className="absolute -inset-1 bg-blue-500/30 rounded-full blur-sm"
                                />
                            )}
                            <div
                                className={`relative h-1.5 rounded-full transition-all duration-300 ${activeSlide === i
                                    ? 'w-8 bg-gradient-to-r from-cyan-400 to-blue-500'
                                    : 'w-2 bg-gray-700 hover:bg-gray-600'
                                    }`}
                            />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
