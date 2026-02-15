
import React, { useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { GripVertical, GitCommit, Trash2, Edit2, ArrowUpFromLine, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Commit {
    hash: string;
    message: string;
    author: string;
}

export interface InteractiveRebaseProps {
    owner: string;
    repo: string;
    prNumber: number;
    headBranch: string;
    baseBranch: string;
    commits: Commit[]; // Initial commit list
}

type ActionType = "pick" | "reword" | "squash" | "drop";

interface RebaseItem extends Commit {
    id: string; // Use hash as ID
    action: ActionType;
    newMessage?: string;
}

function SortableItem({ item, index, onActionChange, onMessageChange }: {
    item: RebaseItem,
    index: number,
    onActionChange: (id: string, action: ActionType) => void,
    onMessageChange: (id: string, msg: string) => void
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 bg-card border rounded mb-2 shadow-sm">
            <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
                <GripVertical className="h-5 w-5" />
            </div>

            <select
                className="h-8 rounded border bg-background text-sm px-2"
                value={item.action}
                onChange={(e) => onActionChange(item.id, e.target.value as ActionType)}
            >
                <option value="pick">Pick</option>
                <option value="reword">Reword</option>
                <option value="squash" disabled={index === 0}>Squash</option>
                <option value="drop">Drop</option>
            </select>

            <div className="flex-1 min-w-0">
                {item.action === "reword" ? (
                    <input
                        className="w-full bg-background border rounded px-2 py-1 text-sm font-mono"
                        value={item.newMessage || item.message}
                        onChange={(e) => onMessageChange(item.id, e.target.value)}
                    />
                ) : (
                    <div className={`font-mono text-sm truncate ${item.action === 'drop' ? 'line-through text-muted-foreground' : ''}`}>
                        {item.message}
                    </div>
                )}
            </div>

            <div className="text-xs text-muted-foreground font-mono">
                {item.id.substring(0, 7)}
            </div>
        </div>
    );
}

export function InteractiveRebase({ owner, repo, prNumber, commits: initialCommits }: InteractiveRebaseProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [items, setItems] = useState<RebaseItem[]>(
        initialCommits.map(c => ({ ...c, id: c.hash, action: "pick" }))
    );
    const [loading, setLoading] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            setItems((items) => {
                const oldIndex = items.findIndex(i => i.id === active.id);
                const newIndex = items.findIndex(i => i.id === over?.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleActionChange = (id: string, action: ActionType) => {
        setItems(items => items.map(item =>
            item.id === id ? { ...item, action } : item
        ));
    };

    const handleMessageChange = (id: string, msg: string) => {
        setItems(items => items.map(item =>
            item.id === id ? { ...item, newMessage: msg } : item
        ));
    };

    const handleSave = async () => {
        // Validation: Ensure we don't drop all commits
        if (items.every(i => i.action === 'drop')) {
            toast.error("Cannot drop all commits. Use 'Delete Branch' instead.");
            return;
        }

        // Validation: First commit cannot be squashed
        if (items[0].action === 'squash') {
            toast.error("Cannot squash the first commit. Pick or Reword it.");
            return;
        }

        setLoading(true);
        // Transform items to operations
        const operations = items.map(item => ({
            type: item.action,
            hash: item.id,
            newMessage: item.newMessage || item.message
        }));

        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}/rewrite`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ operations })
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                // Handle specific error codes if available
                const errorMessage = data.message || data.error || "Failed to rewrite history. Please try again.";
                throw new Error(errorMessage);
            }

            toast.success("History rewritten successfully!", {
                description: "The branch has been force-pushed with your new history."
            });
            setIsOpen(false);

            // Reload after a short delay to let toast show
            setTimeout(() => window.location.reload(), 1500);
        } catch (e: any) {
            console.error("Rebase error:", e);
            toast.error("Rebase Failed", {
                description: e.message || "An unexpected network error occurred.",
                duration: 5000,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit History
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Interactive Rebase</DialogTitle>
                    <DialogDescription>
                        Drag to reorder. Squash commits into the one above. Drop unwanted commits.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={items.map(i => i.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {items.map((item, index) => (
                                <SortableItem
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    onActionChange={handleActionChange}
                                    onMessageChange={handleMessageChange}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>

                <DialogFooter className="gap-2">
                    <div className="text-xs text-muted-foreground mr-auto content-center">
                        {items.filter(i => i.action === 'drop').length} dropped, {items.filter(i => i.action === 'squash').length} squashed
                    </div>
                    <Button variant="secondary" onClick={() => setIsOpen(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={loading} variant="destructive">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Rewrite
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
