import { motion } from "framer-motion";
import { TrendingUp, Flame, Star } from "lucide-react";

interface Developer {
    rank: number;
    name: string;
    lang: string;
    color: string;
}

interface Props {
    developers: Developer[];
}

export default function TrendingDevelopers({ developers }: Props) {
    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Flame className="w-4 h-4 text-orange-400" />;
        if (rank === 2) return <Star className="w-4 h-4 text-yellow-400" />;
        if (rank === 3) return <TrendingUp className="w-4 h-4 text-green-400" />;
        return <span className="text-xs font-mono text-gray-500 w-4 text-center">{rank}</span>;
    };

    const getGradient = (index: number) => {
        const gradients = [
            "from-orange-500 via-amber-500 to-yellow-500",
            "from-purple-500 via-violet-500 to-indigo-500",
            "from-cyan-500 via-blue-500 to-indigo-500",
            "from-green-500 via-emerald-500 to-teal-500",
            "from-pink-500 via-rose-500 to-red-500",
        ];
        return gradients[index % gradients.length];
    };

    return (
        <div className="p-6">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 mb-6"
            >
                <Flame className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm uppercase tracking-widest bg-gradient-to-r from-rose-400 to-orange-400 bg-clip-text text-transparent font-semibold">
                    Trending Developers
                </h3>
            </motion.div>

            <div className="space-y-3">
                {developers.map((dev, i) => (
                    <motion.div
                        key={dev.name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + i * 0.08, type: "spring", stiffness: 100 }}
                        className="relative group cursor-pointer"
                    >
                        {/* Hover glow effect */}
                        <div className={`absolute -inset-1 bg-gradient-to-r ${getGradient(i)} rounded-lg opacity-0 group-hover:opacity-20 blur-md transition-opacity duration-300`} />

                        <div className="relative flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                            {/* Rank */}
                            <div className="w-6 flex justify-center">
                                {getRankIcon(dev.rank)}
                            </div>

                            {/* Avatar with gradient border */}
                            <div className={`relative h-10 w-10 rounded-full p-[2px] bg-gradient-to-br ${getGradient(i)}`}>
                                <div className="h-full w-full rounded-full bg-[#0a0a15] flex items-center justify-center">
                                    <span className="text-sm font-bold text-white">
                                        {dev.name[0].toUpperCase()}
                                    </span>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-200 font-medium group-hover:text-white transition-colors truncate">
                                    {dev.name}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    {/* Progress bar */}
                                    <div className="h-1.5 w-12 bg-gray-800 rounded-full overflow-hidden">
                                        <motion.div
                                            className={`h-full rounded-full bg-gradient-to-r ${getGradient(i)}`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${70 + Math.random() * 30}%` }}
                                            transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                                        />
                                    </div>
                                    <span
                                        className="text-[10px] font-medium"
                                        style={{ color: dev.color }}
                                    >
                                        {dev.lang}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
