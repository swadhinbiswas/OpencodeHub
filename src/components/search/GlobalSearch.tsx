
import * as React from "react";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Search, FileText, User, GitBranch, GitPullRequest, CircleDot, Workflow } from "lucide-react";

export function GlobalSearch() {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [results, setResults] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
                if (
                    (e.target as HTMLElement).tagName === "INPUT" ||
                    (e.target as HTMLElement).tagName === "TEXTAREA"
                ) {
                    return;
                }
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    // Listen for custom open event
    React.useEffect(() => {
        const handleOpen = () => setOpen(true);
        window.addEventListener("open-global-search", handleOpen);
        return () => window.removeEventListener("open-global-search", handleOpen);
    }, []);

    React.useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (data.results) {
                    setResults(data.results);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const handleSelect = (url: string) => {
        setOpen(false);
        window.location.href = url;
    };

    return (
        <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
            <CommandInput
                placeholder="Type a command or search..."
                value={query}
                onValueChange={setQuery}
            />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>

                {results.length > 0 && (
                    <CommandGroup heading="Results">
                        {results.map((result, i) => (
                            <CommandItem
                                key={i}
                                onSelect={() => handleSelect(result.url)}
                                value={result.title + result.subtitle} // for internal filtering
                            >
                                {result.type === 'repository' && <GitBranch className="mr-2 h-4 w-4" />}
                                {result.type === 'user' && <User className="mr-2 h-4 w-4" />}
                                {result.type === 'issue' && <CircleDot className="mr-2 h-4 w-4 text-green-600" />}
                                {result.type === 'pr' && <GitPullRequest className="mr-2 h-4 w-4 text-purple-600" />}
                                {result.type === 'workflow' && <Workflow className="mr-2 h-4 w-4 text-blue-600" />}
                                <div className="flex flex-col">
                                    <span>{result.title}</span>
                                    <span className="text-xs text-muted-foreground">{result.subtitle}</span>
                                </div>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                {results.length === 0 && query.length === 0 && (
                    <CommandGroup heading="Suggestions">
                        <CommandItem
                            onSelect={() => handleSelect("/repositories")}
                        >
                            <GitBranch className="mr-2 h-4 w-4" />
                            <span>Your Repositories</span>
                        </CommandItem>
                        <CommandItem
                            onSelect={() => handleSelect("/explore")}
                        >
                            <Search className="mr-2 h-4 w-4" />
                            <span>Explore</span>
                        </CommandItem>
                    </CommandGroup>
                )}

            </CommandList>
        </CommandDialog>
    );
}
