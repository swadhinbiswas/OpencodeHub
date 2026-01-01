import { motion, AnimatePresence } from "framer-motion";
import { Radio, Clock, GitCommit, GitPullRequest, GitFork, Star, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";

interface LogEntry {
    id: string;
    timestamp: string;
    type: string;
    message: string;
    user: string;
    repo: string;
}

interface Props {
    logs: LogEntry[];
}

const getTypeIcon = (type: string) => {
    const iconClass = "w-3 h-3";
    switch (type.toLowerCase()) {
        case "push": return <GitCommit className={`${iconClass} text-green-400`} />;
        case "pr_open": return <GitPullRequest className={`${iconClass} text-blue-400`} />;
        case "fork": return <GitFork className={`${iconClass} text-purple-400`} />;
        case "star": return <Star className={`${iconClass} text-yellow-400`} />;
        case "comment": return <MessageSquare className={`${iconClass} text-cyan-400`} />;
        default: return <Radio className={`${iconClass} text-gray-400`} />;
    }
};

const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
        case "push": return "text-green-400";
        case "pr_open": return "text-blue-400";
        case "fork": return "text-purple-400";
        case "star": return "text-yellow-400";
        case "comment": return "text-cyan-400";
        default: return "text-gray-400";
    }
};

const getTypeBg = (type: string) => {
    switch (type.toLowerCase()) {
        case "push": return "from-green-500/10 to-transparent";
        case "pr_open": return "from-blue-500/10 to-transparent";
        case "fork": return "from-purple-500/10 to-transparent";
        case "star": return "from-yellow-500/10 to-transparent";
        case "comment": return "from-cyan-500/10 to-transparent";
        default: return "from-gray-500/10 to-transparent";
    }
};

export default function LiveLogStream({ logs }: Props) {
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="p-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        <Radio className="w-4 h-4 text-red-400" />
                    </motion.div>
                    <div>
                        <h3 className="text-sm font-semibold bg-gradient-to-r from-gray-100 to-gray-400 bg-clip-text text-transparent">
                            Data Stream
                        </h3>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Real-Time</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                    <Clock className="w-3 h-3" />
                    {currentTime}
                </div>
            </div>

            {/* Log entries */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                <AnimatePresence initial={false}>
                    {logs.map((log, index) => (
                        <motion.div
                            key={log.id}
                            initial={{ opacity: 0, height: 0, x: 20 }}
                            animate={{ opacity: 1, height: "auto", x: 0 }}
                            exit={{ opacity: 0, height: 0, x: -20 }}
                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                            className={`relative overflow-hidden rounded-lg bg-gradient-to-r ${getTypeBg(log.type)} p-2`}
                        >
                            {/* Timestamp */}
                            <div className="text-[10px] text-gray-600 font-mono mb-1">
                                {log.timestamp}
                            </div>

                            {/* Content */}
                            <div className="flex items-start gap-2">
                                {/* Icon */}
                                <div className="mt-0.5">
                                    {getTypeIcon(log.type)}
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0 text-xs">
                                    <div className="flex flex-wrap gap-x-1.5 items-center">
                                        <span className="text-gray-600 font-mono">#{log.id.substring(0, 7)}</span>
                                        <span className="text-gray-600">:</span>
                                        <span className={`font-semibold ${getTypeColor(log.type)}`}>
                                            {log.type.toUpperCase().replace("_", " ")}
                                        </span>
                                    </div>
                                    <div className="text-gray-400 truncate mt-0.5">
                                        {log.message}
                                    </div>
                                </div>
                            </div>

                            {/* Animated line for new entries */}
                            {index === 0 && (
                                <motion.div
                                    className={`absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b ${getTypeColor(log.type).replace("text", "from")} to-transparent`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: [0, 1, 0] }}
                                    transition={{ duration: 2 }}
                                />
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Fade effect at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0a0a15] to-transparent pointer-events-none" />
        </div>
    );
}
