import { HardDrive, Cpu, Zap, Activity, Wifi, Server } from "lucide-react";
import { motion } from "framer-motion";

interface SystemStatusProps {
    status?: {
        cpuLoad: number;
        memoryUsage: number;
        memoryTotal: number;
        storageUsage: number;
        activeRunners: number;
        uptime: string;
    };
}

// Glowing ring gauge component
function GlowingGauge({
    value,
    color,
    icon: Icon,
    label,
    gradientColors
}: {
    value: number;
    color: string;
    icon: typeof Cpu;
    label: string;
    gradientColors: [string, string];
}) {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (circumference * value) / 100;

    return (
        <motion.div
            className="relative w-28 h-28 flex items-center justify-center group"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, type: "spring" }}
        >
            {/* Outer glow */}
            <div
                className="absolute inset-0 rounded-full blur-xl opacity-40 group-hover:opacity-60 transition-opacity"
                style={{ background: `radial-gradient(circle, ${gradientColors[0]}40, transparent 70%)` }}
            />

            <svg className="w-full h-full transform -rotate-90">
                {/* Background circle */}
                <circle
                    cx="56" cy="56" r={radius}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="8"
                    fill="transparent"
                />
                {/* Animated progress circle */}
                <motion.circle
                    cx="56" cy="56" r={radius}
                    stroke={`url(#gradient-${label})`}
                    strokeWidth="8"
                    fill="transparent"
                    strokeLinecap="round"
                    initial={{ strokeDasharray: circumference, strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                />
                {/* Gradient definition */}
                <defs>
                    <linearGradient id={`gradient-${label}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={gradientColors[0]} />
                        <stop offset="100%" stopColor={gradientColors[1]} />
                    </linearGradient>
                </defs>
            </svg>

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Icon className={`w-4 h-4 mb-1`} style={{ color: gradientColors[0] }} />
                <motion.span
                    className="text-2xl font-bold font-mono text-white"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    {value}%
                </motion.span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{label}</span>
            </div>
        </motion.div>
    );
}

export default function SystemStatus({ status }: SystemStatusProps) {
    if (!status) return null;

    return (
        <div className="flex flex-col items-center gap-6 w-full">
            {/* Main HUD Gauge Cluster */}
            <div className="flex items-center gap-10">
                <GlowingGauge
                    value={status.cpuLoad}
                    color="#3b82f6"
                    icon={Cpu}
                    label="CPU"
                    gradientColors={status.cpuLoad > 80 ? ["#ef4444", "#f97316"] : ["#3b82f6", "#06b6d4"]}
                />
                <GlowingGauge
                    value={status.memoryUsage}
                    color="#8b5cf6"
                    icon={Zap}
                    label="RAM"
                    gradientColors={status.memoryUsage > 80 ? ["#eab308", "#f97316"] : ["#8b5cf6", "#ec4899"]}
                />
            </div>

            {/* Sub-metrics panel with glowing border */}
            <motion.div
                className="relative w-full max-w-md"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
            >
                {/* Glowing border effect */}
                <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-pink-500/30 rounded-2xl blur-sm" />

                <div className="relative glass-panel px-6 py-4 rounded-2xl flex items-center justify-between gap-6 text-xs">
                    {/* Storage Linear Bar */}
                    <div className="flex-1">
                        <div className="flex justify-between mb-1.5 text-gray-400">
                            <span className="flex items-center gap-1.5">
                                <HardDrive className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400/80">Storage</span>
                            </span>
                            <span className="text-emerald-400 font-mono">{status.storageUsage}%</span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${status.storageUsage}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </div>
                    </div>

                    <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/10 to-transparent" />

                    {/* Uptime */}
                    <div className="flex flex-col items-center">
                        <span className="text-gray-500 uppercase tracking-widest text-[10px] mb-1">Uptime</span>
                        <div className="flex items-center gap-1.5">
                            <Activity className="w-3 h-3 text-blue-400" />
                            <span className="font-mono text-white font-medium">{status.uptime}</span>
                        </div>
                    </div>

                    <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/10 to-transparent" />

                    {/* Runners */}
                    <div className="flex flex-col items-center">
                        <span className="text-gray-500 uppercase tracking-widest text-[10px] mb-1">Runners</span>
                        <div className="flex items-center gap-2">
                            <motion.span
                                className="relative flex h-2.5 w-2.5"
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                            </motion.span>
                            <span className="font-mono text-green-400 font-medium">{status.activeRunners} Active</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
