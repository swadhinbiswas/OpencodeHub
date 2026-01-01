import { motion } from "framer-motion";
import { GitCommit, GitPullRequest, GitFork, Star, User, Clock } from "lucide-react";

interface Activity {
    id: string;
    type: "commit" | "pr" | "fork" | "star" | "user";
    user: string;
    action: string;
    target: string;
    time: string;
}

interface Props {
    activities?: Activity[];
}

const activityIcons = {
    commit: { icon: GitCommit, color: "text-green-400", bg: "bg-green-500/10" },
    pr: { icon: GitPullRequest, color: "text-blue-400", bg: "bg-blue-500/10" },
    fork: { icon: GitFork, color: "text-purple-400", bg: "bg-purple-500/10" },
    star: { icon: Star, color: "text-yellow-400", bg: "bg-yellow-500/10" },
    user: { icon: User, color: "text-cyan-400", bg: "bg-cyan-500/10" }
};

// Use real activities from API only
export default function RecentActivity({ activities = [] }: Props) {
    if (activities.length === 0) {
        return (
            <div className="glass-panel rounded-xl p-4 w-72">
                <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
                </div>
                <div className="text-center py-4 text-gray-500 text-sm">
                    No recent activity
                </div>
            </div>
        );
    }
    return (
        <div className="glass-panel rounded-xl p-4 w-72">
            <div className="flex items-center gap-2 mb-4">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                >
                    <Clock className="w-4 h-4 text-cyan-400" />
                </motion.div>
                <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
            </div>

            <div className="space-y-3">
                {activities.slice(0, 4).map((activity, i) => {
                    const { icon: Icon, color, bg } = activityIcons[activity.type];

                    return (
                        <motion.div
                            key={activity.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="flex items-start gap-3 group"
                        >
                            {/* Icon */}
                            <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-3.5 h-3.5 ${color}`} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-300 truncate">
                                    <span className="font-medium text-white">{activity.user}</span>
                                    <span className="text-gray-500"> {activity.action} </span>
                                    <span className="text-cyan-400">{activity.target}</span>
                                </div>
                                <div className="text-[10px] text-gray-600 mt-0.5">
                                    {activity.time}
                                </div>
                            </div>

                            {/* Line connector */}
                            {i < activities.length - 1 && (
                                <div className="absolute left-[13px] top-8 w-[1px] h-4 bg-gradient-to-b from-gray-700 to-transparent" />
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
