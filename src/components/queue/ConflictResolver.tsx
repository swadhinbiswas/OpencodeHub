
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { AlertCircle, Check, FileCode, Loader2, Wrench } from 'lucide-react';
import { toast } from 'sonner';

interface ConflictFile {
    path: string;
    content: string;
}

interface ConflictResolverProps {
    owner: string;
    repo: string;
    queueItemId: string;
    triggerButton?: React.ReactNode;
    variant?: "default" | "icon";
}

export function ConflictResolver({ owner, repo, queueItemId, triggerButton, variant = "default" }: ConflictResolverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [conflicts, setConflicts] = useState<ConflictFile[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [resolutions, setResolutions] = useState<{ path: string, content: string }[]>([]);
    const [currentContent, setCurrentContent] = useState("");

    const fetchConflicts = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/queue/${queueItemId}/conflicts`);
            if (!res.ok) throw new Error("Failed to check conflicts");
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setConflicts(data);
            if (data.length > 0) {
                setCurrentContent(data[0].content);
            } else {
                toast.success("No conflicts detected via check.");
                setIsOpen(false);
            }
        } catch (e: any) {
            toast.error(e.message);
            setIsOpen(false);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (open) {
            setConflicts([]);
            setResolutions([]);
            setCurrentIndex(0);
            fetchConflicts();
        }
    };

    const handleNext = () => {
        // Save current resolution
        const currentFile = conflicts[currentIndex];
        const newResolutions = [...resolutions];
        const existingIndex = newResolutions.findIndex(r => r.path === currentFile.path);

        if (existingIndex >= 0) {
            newResolutions[existingIndex] = { path: currentFile.path, content: currentContent };
        } else {
            newResolutions.push({ path: currentFile.path, content: currentContent });
        }
        setResolutions(newResolutions);

        if (currentIndex < conflicts.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setCurrentContent(conflicts[currentIndex + 1].content);
        } else {
            // All done, submit
            submitResolutions(newResolutions);
        }
    };

    const submitResolutions = async (finalResolutions: { path: string, content: string }[]) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/queue/${queueItemId}/conflicts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resolutions: finalResolutions })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to submit resolutions");
            }

            toast.success("Conflicts resolved and merge committed!");
            setIsOpen(false);
            window.location.reload(); // Refresh to see updated queue status
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    const currentFile = conflicts[currentIndex];

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {triggerButton ? triggerButton : variant === "icon" ? (
                    <button
                        className="p-1.5 rounded hover:bg-muted transition-colors text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        title="Resolve Conflicts"
                    >
                        <Wrench className="h-4 w-4" />
                    </button>
                ) : (
                    <Button variant="destructive" size="sm">Resolve Conflicts</Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Resolve Conflicts</DialogTitle>
                    <DialogDescription>
                        Fix merge conflicts manually. {conflicts.length > 0 && `File ${currentIndex + 1} of ${conflicts.length}`}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col gap-4 py-4">
                    {loading && conflicts.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="ml-2">Checking for conflicts...</span>
                        </div>
                    ) : conflicts.length > 0 && currentFile ? (
                        <>
                            <div className="flex items-center gap-2 font-mono text-sm bg-muted p-2 rounded">
                                <FileCode className="h-4 w-4" />
                                {currentFile.path}
                            </div>
                            <textarea
                                className="flex-1 w-full p-4 font-mono text-xs border rounded resize-none bg-slate-950 text-slate-50 focus:outline-none focus:ring-2 focus:ring-primary"
                                value={currentContent}
                                onChange={(e) => setCurrentContent(e.target.value)}
                                spellCheck={false}
                            />
                            <div className="text-xs text-muted-foreground">
                                Make sure to remove <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>, <code>=======</code>, and <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> markers.
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            No conflicts loaded.
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={handleNext} disabled={loading || conflicts.length === 0}>
                        {currentIndex < conflicts.length - 1 ? "Next File" : "Complete Resolution"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
