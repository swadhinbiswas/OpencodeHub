
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
            {/* Watch */}
            <div className="flex items-center rounded-lg border bg-background overflow-hidden shadow-sm">
                <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-none border-r px-3 hover:bg-muted"
                >
                    <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
                    Watch
                    <span className="ml-2 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                        {watchers}
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
                    className="rounded-none border-r px-3 hover:bg-muted"
                >
                    <Star className="mr-2 h-4 w-4 text-muted-foreground" />
                    Star
                    <span className="ml-2 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                        {stars}
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
