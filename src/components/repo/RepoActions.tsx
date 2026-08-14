
import * as React from "react";
import {
    Eye,
    GitFork,
    Star,
    ChevronDown,
    Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface RepoActionsProps {
    owner: string;
    repo: string;
    watchers: number;
    forks: number;
    stars: number;
    isLoggedIn: boolean;
}

export function RepoActions({
    owner,
    repo,
    watchers,
    forks,
    stars,
    isLoggedIn
}: RepoActionsProps) {
    const [isForking, setIsForking] = React.useState(false);
    const [isStarred, setIsStarred] = React.useState(false);
    const [currentStarCount, setCurrentStarCount] = React.useState(stars);
    const [isStarring, setIsStarring] = React.useState(false);
    const [isWatching, setIsWatching] = React.useState(false);
    const [watchLevel, setWatchLevel] = React.useState<string>("watching");
    const [watchMenuOpen, setWatchMenuOpen] = React.useState(false);
    const [currentWatchCount, setCurrentWatchCount] = React.useState(watchers);

    React.useEffect(() => {
        const starred = localStorage.getItem(`starred_${owner}_${repo}`);
        if (starred === "true") {
            setIsStarred(true);
        }
        // Load real watch state from the API (WS2-11)
        fetch(`/api/repos/${owner}/${repo}/subscription`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data?.data?.watching) {
                    setIsWatching(true);
                    setWatchLevel(data.data.watchLevel || "watching");
                }
            })
            .catch(() => {});
    }, [owner, repo]);

    const handleWatch = async (level: string) => {
        if (!isLoggedIn) {
            window.location.href = "/login";
            return;
        }
        const wasWatching = isWatching;
        try {
            if (wasWatching && level === "watching" && watchLevel === "watching") {
                // toggle off
                const res = await fetch(`/api/repos/${owner}/${repo}/subscription`, {
                    method: "DELETE",
                });
                if (res.ok) {
                    setIsWatching(false);
                    setCurrentWatchCount((p) => Math.max(0, p - 1));
                }
            } else {
                const res = await fetch(`/api/repos/${owner}/${repo}/subscription`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ watchLevel: level }),
                });
                if (res.ok) {
                    if (!wasWatching) setCurrentWatchCount((p) => p + 1);
                    setIsWatching(true);
                    setWatchLevel(level);
                }
            }
        } catch (e) {
            console.error("Watch error:", e);
        }
        setWatchMenuOpen(false);
    };

    const handleStar = async () => {
        if (isStarring) return;
        setIsStarring(true);

        const newStarredState = !isStarred;
        try {
            const response = await fetch(`/api/repos/${owner}/${repo}/star`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: newStarredState ? "star" : "unstar" }),
            });

            if (response.ok) {
                setIsStarred(newStarredState);
                setCurrentStarCount(prev => newStarredState ? prev + 1 : prev - 1);
                
                if (newStarredState) {
                    localStorage.setItem(`starred_${owner}_${repo}`, "true");
                } else {
                    localStorage.removeItem(`starred_${owner}_${repo}`);
                }
            }
        } catch (error) {
            console.error("Error starring repo:", error);
        } finally {
            setIsStarring(false);
        }
    };

    const handleFork = async () => {
        if (!isLoggedIn) {
            window.location.href = "/login";
            return;
        }

        setIsForking(true);
        try {
            const response = await fetch(`/api/repos/${owner}/${repo}/fork`, {
                method: "POST",
            });

            const data = await response.json();

            if (response.ok) {
                window.location.href = data.fork.url;
            } else if (response.status === 409) {
                // Already forked - redirect to existing fork
                window.location.href = `/${data.fork.owner}/${data.fork.name}`;
            } else {
                alert(data.message || "Failed to fork repository");
                setIsForking(false);
            }
        } catch (error) {
            console.error("Fork error:", error);
            alert("Failed to fork repository");
            setIsForking(false);
        }
    };

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {/* Watch (WS2-11) */}
            <div className="relative flex items-center rounded-lg border bg-background overflow-hidden shadow-sm">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleWatch(watchLevel)}
                    className="rounded-none border-r px-3 hover:bg-muted"
                >
                    <Eye className={`mr-2 h-4 w-4 ${isWatching ? "text-cyan-400" : "text-muted-foreground"}`} />
                    {isWatching ? "Watching" : "Watch"}
                    <span className="ml-2 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                        {currentWatchCount}
                    </span>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWatchMenuOpen((o) => !o)}
                    className="px-2 rounded-none hover:bg-muted"
                >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
                {watchMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border bg-background shadow-lg py-1">
                        {[
                            { value: "watching", label: "Watching", desc: "Notifications on all activity" },
                            { value: "releases_only", label: "Releases only", desc: "Notifications on new releases" },
                            { value: "ignoring", label: "Ignoring", desc: "Never notify me" },
                        ].map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => handleWatch(opt.value)}
                                className={`w-full text-left px-3 py-2 hover:bg-muted text-sm ${watchLevel === opt.value && isWatching ? "text-cyan-400" : ""}`}
                            >
                                <span className="block font-medium">{opt.label}</span>
                                <span className="block text-xs text-muted-foreground">{opt.desc}</span>
                            </button>
                        ))}
                        {isWatching && (
                            <button
                                onClick={() => handleWatch("ignoring").then(() => {})}
                                className="w-full text-left px-3 py-2 hover:bg-muted text-sm text-red-400"
                            >
                                Unwatch
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Fork */}
            <div className="flex items-center rounded-lg border bg-background overflow-hidden shadow-sm">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleFork}
                    disabled={isForking}
                    className="rounded-none px-3 hover:bg-muted"
                >
                    {isForking ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <GitFork className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    Fork
                    <span className="ml-2 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                        {forks}
                    </span>
                </Button>
            </div>

            {/* Star */}
            <div className="flex items-center rounded-lg border bg-background overflow-hidden shadow-sm">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStar}
                    disabled={isStarring}
                    className={`rounded-none border-r px-3 hover:bg-muted ${isStarred ? 'text-amber-500' : ''}`}
                >
                    {isStarring ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Star className={`mr-2 h-4 w-4 ${isStarred ? 'fill-amber-500' : 'text-muted-foreground'}`} />
                    )}
                    {isStarred ? 'Starred' : 'Star'}
                    <span className="ml-2 rounded-full bg-muted text-foreground px-2 py-0.5 text-xs font-medium">
                        {currentStarCount}
                    </span>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 rounded-none hover:bg-muted"
                >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
            </div>
        </div>
    );
}
