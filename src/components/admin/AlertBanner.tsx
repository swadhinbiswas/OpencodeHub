import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle, Info, Bell, X } from "lucide-react";
import { useState } from "react";

interface Alert {
    id: string;
    type: "success" | "warning" | "info" | "error";
    message: string;
    timestamp: string;
}

interface Props {
    alerts?: Alert[];
}

const alertStyles = {
    success: {
        bg: "from-green-500/10 via-emerald-500/5 to-transparent",
        border: "border-green-500/30",
        icon: CheckCircle,
        iconColor: "text-green-400",
        glow: "shadow-green-500/20"
    },
    warning: {
        bg: "from-yellow-500/10 via-amber-500/5 to-transparent",
        border: "border-yellow-500/30",
        icon: AlertTriangle,
        iconColor: "text-yellow-400",
        glow: "shadow-yellow-500/20"
    },
    info: {
        bg: "from-blue-500/10 via-cyan-500/5 to-transparent",
        border: "border-blue-500/30",
        icon: Info,
        iconColor: "text-blue-400",
        glow: "shadow-blue-500/20"
    },
    error: {
        bg: "from-red-500/10 via-rose-500/5 to-transparent",
        border: "border-red-500/30",
        icon: AlertTriangle,
        iconColor: "text-red-400",
        glow: "shadow-red-500/20"
    }
};

const defaultAlerts: Alert[] = [
    {
        id: "1",
        type: "success",
        message: "All systems operational • 99.9% uptime this month",
        timestamp: "Just now"
    }
];

export default function AlertBanner({ alerts = defaultAlerts }: Props) {
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

    const visibleAlerts = alerts.filter(a => !dismissedIds.has(a.id));

    if (visibleAlerts.length === 0) return null;

    const alert = visibleAlerts[0];
    const style = alertStyles[alert.type];
    const Icon = style.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full max-w-2xl mx-auto"
        >
            <div className={`relative overflow-hidden rounded-lg border ${style.border} bg-gradient-to-r ${style.bg} backdrop-blur-sm shadow-lg ${style.glow}`}>
                {/* Animated shimmer */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />

                <div className="relative flex items-center gap-3 px-4 py-2.5">
                    {/* Pulsing icon */}
                    <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        <Icon className={`w-4 h-4 ${style.iconColor}`} />
                    </motion.div>

                    {/* Message */}
                    <span className="flex-1 text-sm text-gray-200">
                        {alert.message}
                    </span>

                    {/* Timestamp */}
                    <span className="text-xs text-gray-500 font-mono">
                        {alert.timestamp}
                    </span>

                    {/* Dismiss button */}
                    <button
                        onClick={() => setDismissedIds(prev => new Set([...prev, alert.id]))}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                    >
                        <X className="w-3 h-3 text-gray-500 hover:text-gray-300" />
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
