import { useEffect, useState, lazy, Suspense, Component, ReactNode } from "react";
import DashboardStats from "./DashboardStats";
import TrendingDevelopers from "./TrendingDevelopers";
import LiveLogStream from "./LiveLogStream";
import BottomPanel from "./BottomPanel";
import SystemStatus from "./SystemStatus";
import QuickStatsRow from "./QuickStatsRow";
import AlertBanner from "./AlertBanner";
import RecentActivity from "./RecentActivity";
import { Github } from "lucide-react";

// Error boundary for WebGL/Globe issues
class GlobeErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        console.warn("Globe component error:", error.message);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center text-white/50">
                        <div className="text-6xl mb-4">🌐</div>
                        <p className="text-sm">3D Globe unavailable</p>
                        <p className="text-xs mt-1 opacity-50">WebGL may not be supported</p>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const GlobeViz = lazy(() => import("./GlobeViz").catch(() => ({
    default: () => (
        <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-white/50">
                <div className="text-6xl mb-4">🌐</div>
                <p className="text-sm">Globe failed to load</p>
            </div>
        </div>
    )
})));

export default function AdminDashboard() {
    const [data, setData] = useState<any>({
        totalRepos: 0,
        totalUsers: 0,
        collaborations: 0,
        trendingDevelopers: [],
        activityLog: [],
        codeStats: {},
        reviewStats: {},
        languages: [],
        quickStats: {}
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch("/api/admin/stats");
                const json = await res.json();
                setData(json);
            } catch (e) {
                console.error("Failed to fetch admin stats");
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="relative h-full w-full">
            {/* 3D Globe Background */}
            <div className="absolute inset-0 z-0 opacity-80 pointer-events-auto">
                <GlobeErrorBoundary>
                    <Suspense fallback={
                        <div className="w-full h-full flex items-center justify-center">
                            <div className="text-white/30 text-sm">Loading globe...</div>
                        </div>
                    }>
                        <GlobeViz activities={data.activityLog || []} />
                    </Suspense>
                </GlobeErrorBoundary>
            </div>

            <div className="relative z-10 flex flex-col h-full p-6 pb-8 pointer-events-none">

                {/* Top Alert Banner */}
                <div className="mb-4 pointer-events-auto shrink-0">
                    <AlertBanner />
                </div>

                {/* Quick Stats Row - Top Center */}
                <div className="mb-4 pointer-events-auto shrink-0 flex justify-center">
                    <QuickStatsRow stats={data.quickStats || {}} />
                </div>

                {/* Main Content Grid */}
                <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
                    {/* Left Column: Stats & Trending */}
                    <div className="col-span-3 flex flex-col gap-4 pointer-events-auto overflow-hidden">
                        {/* Stats Block */}
                        <div className="glass-panel rounded-xl shrink-0">
                            <DashboardStats stats={data} />
                        </div>

                        {/* Trending Devs Block */}
                        <div className="glass-panel rounded-xl flex-1 overflow-y-auto custom-scrollbar min-h-0">
                            <TrendingDevelopers developers={data.trendingDevelopers || []} />
                        </div>
                    </div>

                    {/* Middle Column: Globe Area with System Status */}
                    <div className="col-span-6 flex flex-col justify-between items-center pointer-events-none py-4">
                        {/* Top area - Recent Activity floating */}
                        <div className="pointer-events-auto self-start">
                            <RecentActivity activities={data.recentActivity || []} />
                        </div>

                        {/* Bottom - System Status HUD */}
                        <div className="pointer-events-auto">
                            <SystemStatus status={data.systemStatus} />
                        </div>
                    </div>

                    {/* Right Column: Log Stream */}
                    <div className="col-span-3 flex flex-col gap-4 pointer-events-auto overflow-hidden">
                        <div className="flex justify-end shrink-0">
                            <Github className="h-8 w-8 text-white opacity-30 hover:opacity-70 transition-opacity cursor-pointer" />
                        </div>

                        <div className="glass-panel rounded-xl flex-1 overflow-hidden min-h-0 relative">
                            <LiveLogStream logs={data.activityLog || []} />
                        </div>
                    </div>
                </div>

                {/* Bottom Section: Carousel Panel */}
                <div className="h-48 shrink-0 pointer-events-auto mt-4">
                    <BottomPanel stats={data} />
                </div>

            </div>
        </div>
    );
}
