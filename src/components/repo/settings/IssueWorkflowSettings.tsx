import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Plus, GripVertical, Trash2 } from "lucide-react";

interface IssueStatus {
    id: string;
    name: string;
    color: string;
    type: "open" | "completed" | "cancelled";
    order: number;
    isDefault: number;
}

interface IssueWorkflowSettingsProps {
    repositoryId: string;
    owner: string;
    repo: string;
}

export default function IssueWorkflowSettings({ repositoryId, owner, repo }: IssueWorkflowSettingsProps) {
    const [statuses, setStatuses] = useState<IssueStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchStatuses();
    }, [owner, repo]);

    async function fetchStatuses() {
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/settings/issue-statuses`);
            if (res.ok) {
                const data = await res.json();
                setStatuses(data);
            }
        } catch (e) {
            console.error(e);
            toast.error("Failed to load statuses");
        } finally {
            setLoading(false);
        }
    }

    async function addStatus() {
        if (!newName) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/settings/issue-statuses`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newName,
                    color: "#808080",
                    type: "open"
                })
            });

            if (!res.ok) throw new Error("Failed to create status");

            const newStatus = await res.json();
            setStatuses([...statuses, newStatus]);
            setNewName("");
            toast.success("Status created");
        } catch (e) {
            toast.error("Failed to create status");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function deleteStatus(id: string) {
        if (!confirm("Are you sure? This status will be removed.")) return;
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/settings/issue-statuses/${id}`, {
                method: "DELETE"
            });

            if (!res.ok) throw new Error("Failed to delete status");

            setStatuses(statuses.filter(s => s.id !== id));
            toast.success("Status deleted");
        } catch (e) {
            toast.error("Failed to delete status");
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Issue Statuses (Kanban)</CardTitle>
                    <CardDescription>
                        Define custom statuses for issues (e.g., "Backlog", "In Progress", "Done").
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="flex justify-center p-4">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {statuses.length === 0 && (
                                <p className="text-sm text-muted-foreground">No statuses defined.</p>
                            )}

                            {statuses.map(status => (
                                <div key={status.id} className="flex items-center justify-between p-3 border rounded-md bg-card">
                                    <div className="flex items-center gap-3">
                                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: status.color }} />
                                        <div>
                                            <p className="font-medium text-sm">{status.name}</p>
                                            <p className="text-xs text-muted-foreground capitalize">{status.type}</p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteStatus(status.id)}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-end gap-2 pt-4 border-t">
                        <div className="grid w-full gap-1.5">
                            <Label htmlFor="status-name">New Status Name</Label>
                            <Input
                                id="status-name"
                                placeholder="e.g. In Progress"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addStatus()}
                            />
                        </div>
                        <Button disabled={!newName || isSubmitting} onClick={addStatus}>
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                            Add
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
