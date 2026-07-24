import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Plus, GripVertical, Trash2, Check, X } from "lucide-react";
import type { PRStateDefinition } from "@/db/schema/pr-states";


interface WorkflowSettingsProps {
    repositoryId: string;
    owner: string;
    repo: string;
}

export default function WorkflowSettings({ repositoryId, owner, repo }: WorkflowSettingsProps) {
    const [states, setStates] = useState<PRStateDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [newStateName, setNewStateName] = useState("");
    const [newStateDesc, setNewStateDesc] = useState("");
    const [allowMerge, setAllowMerge] = useState(false);
    const [requireCodeOwner, setRequireCodeOwner] = useState(false);
    const [reviewerUsernames, setReviewerUsernames] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch existing states
    useEffect(() => {
        fetchStates();
    }, [owner, repo]);

    async function fetchStates() {
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/settings/states`);
            if (res.ok) {
                const data = await res.json();
                setStates(data);
            }
        } catch (e) {
            console.error(e);
            toast.error("Failed to load states");
        } finally {
            setLoading(false);
        }
    }

    async function addState() {
        if (!newStateName) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/settings/states`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newStateName.toLowerCase().replace(/\s+/g, "_"),
                    displayName: newStateName,
                    color: "#6B7280", // Default color for now, can add picker later
                    description: newStateDesc || undefined,
                    allowMerge,
                    requireCodeOwner,
                    reviewers: reviewerUsernames ? reviewerUsernames.split(",").map(u => ({ username: u.trim() })).filter(u => u.username) : undefined
                })
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err || "Failed to create state");
            }

            const newState = await res.json();
            setStates([...states, newState]);
            setNewStateName("");
            setNewStateDesc("");
            setReviewerUsernames("");
            setAllowMerge(false);
            setRequireCodeOwner(false);
            toast.success("State created");
        } catch (e) {
            console.error(e);
            toast.error("Failed to create state");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function deleteState(id: string) {
        if (!confirm("Are you sure? This state will be removed.")) return;
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/settings/states/${id}`, {
                method: "DELETE"
            });

            if (!res.ok) throw new Error("Failed to delete state");

            setStates(states.filter(s => s.id !== id));
            toast.success("State deleted");
        } catch (e) {
            toast.error("Failed to delete state");
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Custom Pull Request States</CardTitle>
                    <CardDescription>
                        Define custom workflow states for pull requests (e.g., "In Review", "QA", "Ready for Merge").
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="flex justify-center p-4">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {states.length === 0 && (
                                <p className="text-sm text-muted-foreground">No custom states defined. Default states (Open, Closed, Merged) are always active.</p>
                            )}

                            {states.map(state => (
                                <div key={state.id} className="flex items-center justify-between p-3 border rounded-md bg-card">
                                    <div className="flex items-center gap-3">
                                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: state.color }} />
                                        <div>
                                            <p className="font-medium text-sm">{state.displayName}</p>
                                            <p className="text-xs text-muted-foreground">{state.name} {state.description ? `- ${state.description}` : ""}</p>
                                            <div className="flex gap-2 mt-1">
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${state.allowMerge ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {state.allowMerge ? <Check className="w-3 h-3"/> : <X className="w-3 h-3"/>} Merge
                                                </span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${state.requireCodeOwner ? 'bg-purple-500/10 text-purple-500' : 'bg-gray-500/10 text-gray-500'}`}>
                                                    {state.requireCodeOwner ? <Check className="w-3 h-3"/> : <X className="w-3 h-3"/>} CodeOwner
                                                </span>
                                            </div>
                                        </div>
                                        {state.isDefault && <span className="text-xs bg-secondary px-2 py-0.5 rounded text-secondary-foreground">Default</span>}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteState(state.id)}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid gap-4 pt-4 border-t">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="state-name">State Identifier</Label>
                                <Input
                                    id="state-name"
                                    placeholder="e.g. in_review"
                                    value={newStateName}
                                    onChange={(e) => setNewStateName(e.target.value)}
                                />
                                <p className="text-[0.8rem] text-muted-foreground">Internal ID (slug)</p>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="display-name">Display Name</Label>
                                <Input
                                    id="display-name"
                                    placeholder="e.g. In Review"
                                    value={newStateName} // Simple binding for now, effectively same as ID
                                    disabled
                                />
                            </div>
                            <div className="grid gap-1.5 col-span-2">
                                <Label htmlFor="state-desc">Description</Label>
                                <Input
                                    id="state-desc"
                                    placeholder="e.g. Code is currently under review"
                                    value={newStateDesc}
                                    onChange={(e) => setNewStateDesc(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-1.5 col-span-2">
                                <Label htmlFor="state-reviewers">Required Reviewers (Usernames, comma separated)</Label>
                                <Input
                                    id="state-reviewers"
                                    placeholder="e.g. alice, bob"
                                    value={reviewerUsernames}
                                    onChange={(e) => setReviewerUsernames(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-1.5 col-span-2 mt-2">
                                <label className="flex items-center gap-2 text-sm font-medium">
                                    <input type="checkbox" className="rounded border-gray-300" checked={allowMerge} onChange={(e) => setAllowMerge(e.target.checked)} />
                                    Allow Merging in this state
                                </label>
                                <p className="text-[0.8rem] text-muted-foreground ml-6">If unchecked, pull requests in this state cannot be merged.</p>
                                <label className="flex items-center gap-2 text-sm font-medium mt-2">
                                    <input type="checkbox" className="rounded border-gray-300" checked={requireCodeOwner} onChange={(e) => setRequireCodeOwner(e.target.checked)} />
                                    Enforce CODEOWNERS
                                </label>
                                <p className="text-[0.8rem] text-muted-foreground ml-6">Require approvals from CODEOWNERS before this state allows merging.</p>
                            </div>
                        </div>
                        <Button disabled={!newStateName || isSubmitting} onClick={addState} className="w-full">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                            Create State
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
