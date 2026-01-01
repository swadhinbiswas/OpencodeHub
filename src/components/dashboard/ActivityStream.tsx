
import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface ActivityUser {
    id: string;
    username: string;
    avatarUrl?: string;
}

interface ActivityStreamProps {
    activeCount: number;
    users: ActivityUser[];
    className?: string;
}

export function ActivityStream({ activeCount, users, className }: ActivityStreamProps) {
    // Mock timeline dots for visual effect matching the image
    // In a real app, these could represent specific timestamps of events
    // Professional, minimal palette (monochromatic with accents)
    const dots = [
        { color: "bg-indigo-500", left: "10%", delay: "0s" },
        { color: "bg-indigo-400", left: "30%", delay: "1s" },
        { color: "bg-violet-500", left: "50%", delay: "2s" },
        { color: "bg-indigo-300", left: "65%", delay: "1.5s" },
        { color: "bg-white", left: "85%", delay: "0.5s" },
    ];

    return (
        <div className={cn("w-full relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-all hover:bg-white/10 hover:border-white/20", className)}>
            {/* Subtle background glow effect using CSS gradients */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col space-y-6 relative z-10">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/70 uppercase">
                        Live Code Review Activity
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Real-time</span>
                    </div>
                </div>

                <div className="flex items-center gap-12">
                    {/* Left Stat - Clean & Big */}
                    <div className="flex flex-col">
                        <span className="text-5xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50">
                            {activeCount}
                        </span>
                        <span className="text-xs font-medium text-muted-foreground mt-1">
                            Developers shipping code
                        </span>
                    </div>

                    {/* Timeline Visualization - Minimal & Tech */}
                    <div className="flex-1 relative h-px bg-gradient-to-r from-transparent via-white/20 to-transparent flex items-center">
                        {/* Moving light effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent w-1/2 blur-[1px] animate-[shimmer_3s_infinite_linear]" />

                        {/* Dots with pulse */}
                        {dots.map((dot, i) => (
                            <div
                                key={i}
                                className={cn("absolute w-1.5 h-1.5 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000", dot.color)}
                                style={{ left: dot.left }}
                            >
                                <div className={cn("absolute inset-0 rounded-full animate-ping opacity-20", dot.color)} style={{ animationDelay: dot.delay }} />
                            </div>
                        ))}
                    </div>

                    {/* User Avatars - Tighter & Cleaner */}
                    <div className="flex items-center -space-x-4 pl-4">
                        {users.slice(0, 5).map((user, i) => (
                            <div key={user.id} className="relative group transition-transform hover:-translate-y-1 hover:z-20">
                                <Avatar className="w-12 h-12 border-2 border-[#09090b] ring-1 ring-white/10 transition-shadow group-hover:ring-indigo-500/50">
                                    <AvatarImage src={user.avatarUrl} alt={user.username} className="object-cover" />
                                    <AvatarFallback className="text-xs bg-zinc-900 font-medium text-zinc-400">
                                        {user.username.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                {/* Tooltip on hover */}
                                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none border border-white/10">
                                    @{user.username}
                                </div>
                            </div>
                        ))}
                        {users.length > 5 && (
                            <div className="relative z-0 group">
                                <div className="w-12 h-12 rounded-full bg-[#09090b] border-2 border-[#09090b] ring-1 ring-white/10 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:border-indigo-500/50 transition-colors">
                                    +{users.length - 5}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
        </div>
    );
}
