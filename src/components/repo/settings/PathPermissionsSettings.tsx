import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface PathPermission {
    id: string;
    pathPattern: string;
    userId: string | null;
    teamId: string | null;
    permission: "read" | "write" | "admin";
    requireApproval: string;
}

interface PathPermissionsSettingsProps {
    repositoryId: string;
    owner: string;
    repo: string;
}

export default function PathPermissionsSettings({ repositoryId, owner, repo }: PathPermissionsSettingsProps) {
    const [permissions, setPermissions] = useState<PathPermission[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [newPattern, setNewPattern] = useState("");
    const [newUserId, setNewUserId] = useState("");
    const [newTeamId, setNewTeamId] = useState("");
    const [newPermission, setNewPermission] = useState<"read" | "write" | "admin">("write");
    const [newRequireApproval, setNewRequireApproval] = useState(false);
    
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchPermissions();
    }, [owner, repo]);

    async function fetchPermissions() {
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/settings/path-permissions`);
            if (res.ok) {
                const data = await res.json();
                setPermissions(data.rules || []);
            }
        } catch (e) {
            console.error(e);
            toast.error("Failed to load path permissions");
        } finally {
            setLoading(false);
        }
    }

    async function addPermission() {
        if (!newPattern || (!newUserId && !newTeamId)) return;
        setIsSubmitting(true);
        try {
            const payload: any = {
                pathPattern: newPattern,
                permission: newPermission,
                requireApproval: newRequireApproval
            };
            if (newUserId) payload.userId = newUserId;
            else if (newTeamId) payload.teamId = newTeamId;

            const res = await fetch(`/api/repos/${owner}/${repo}/settings/path-permissions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err || "Failed to add permission");
            }

            const newPerm = await res.json();
            setPermissions([...permissions, newPerm]);
            setNewPattern("");
            setNewUserId("");
            setNewTeamId("");
            setNewRequireApproval(false);
            toast.success("Path permission added");
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || "Failed to add permission");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function deletePermission(id: string) {
        if (!confirm("Are you sure you want to remove this permission?")) return;
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/settings/path-permissions/${id}`, {
                method: "DELETE"
            });

            if (!res.ok) throw new Error("Failed to delete permission");

            setPermissions(permissions.filter(p => p.id !== id));
            toast.success("Permission removed");
        } catch (e) {
            toast.error("Failed to delete permission");
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>File-Level Permissions</CardTitle>
                    <CardDescription>
                        Enforce granular Read/Write controls at specific repository paths. 
                        Use glob patterns like `src/**` or `packages/frontend/*`.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {loading ? (
                        <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <div className="space-y-4">
                            {permissions.length === 0 ? (
                                <div className="text-center p-8 border border-dashed rounded-md text-muted-foreground">
                                    No path permissions defined.
                                </div>
                            ) : (
                                <div className="rounded-md border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-muted/50 text-left">
                                                <th className="p-3 font-medium">Path Pattern</th>
                                                <th className="p-3 font-medium">Target</th>
                                                <th className="p-3 font-medium">Access Level</th>
                                                <th className="p-3 font-medium">Requires Approval</th>
                                                <th className="p-3 font-medium text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {permissions.map(p => (
                                                <tr key={p.id} className="border-b last:border-0 group">
                                                    <td className="p-3 font-mono text-xs">{p.pathPattern}</td>
                                                    <td className="p-3">
                                                        {p.userId ? `User: ${p.userId}` : `Team: ${p.teamId}`}
                                                    </td>
                                                    <td className="p-3 capitalize">{p.permission}</td>
                                                    <td className="p-3">{p.requireApproval === "true" ? "Yes" : "No"}</td>
                                                    <td className="p-3 text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => deletePermission(p.id)}
                                                            className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-6 border-t space-y-4">
                        <h4 className="text-sm font-medium">Add New Path Permission</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Path Pattern</Label>
                                <Input 
                                    placeholder="e.g., src/api/**" 
                                    value={newPattern}
                                    onChange={e => setNewPattern(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>User ID (or use Team ID below)</Label>
                                <Input 
                                    placeholder="UUID of user" 
                                    value={newUserId}
                                    onChange={e => { setNewUserId(e.target.value); setNewTeamId(""); }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Team ID</Label>
                                <Input 
                                    placeholder="UUID of team" 
                                    value={newTeamId}
                                    onChange={e => { setNewTeamId(e.target.value); setNewUserId(""); }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Access Level</Label>
                                <Select value={newPermission} onValueChange={(val: any) => setNewPermission(val)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="read">Read Only</SelectItem>
                                        <SelectItem value="write">Read & Write</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 flex flex-col justify-center pt-2">
                                <div className="flex items-center gap-2">
                                    <Switch 
                                        checked={newRequireApproval} 
                                        onCheckedChange={setNewRequireApproval} 
                                        id="require-approval" 
                                    />
                                    <Label htmlFor="require-approval" className="cursor-pointer">
                                        Require PR Approval
                                    </Label>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    If enabled, acts like CODEOWNERS for this path.
                                </p>
                            </div>
                        </div>
                        <Button 
                            onClick={addPermission} 
                            disabled={isSubmitting || !newPattern || (!newUserId && !newTeamId)}
                            className="mt-4"
                        >
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Plus className="mr-2 h-4 w-4" />
                            Add Permission
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
