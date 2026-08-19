import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface RepoSettingsProps {
    repo: {
        owner: string;
        name: string;
        description?: string;
        visibility: "public" | "private" | "internal";
        defaultBranch: string;
        hasIssues: boolean;
        hasWiki: boolean;
        hasActions: boolean;
        isArchived: boolean;
        isTemplate: boolean;
        isFork?: boolean;
        forkedFromUrl?: string | null;
        allowExternalPulls?: boolean;
    };
}

export default function RepoSettings({ repo }: RepoSettingsProps) {
    const [loading, setLoading] = useState(false);
    const [branches, setBranches] = useState<string[]>([]);
    const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
    const [transferTarget, setTransferTarget] = useState("");
    const [allowExternalPulls, setAllowExternalPulls] = useState(!!repo.allowExternalPulls);
    const [savingFederation, setSavingFederation] = useState(false);

    useEffect(() => {
        // Load organizations the user can transfer to (WS3-05)
        fetch("/api/orgs")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                const orgs = data?.data?.organizations || [];
                // only orgs where the user is owner/admin
                const adminOrgs = orgs.filter(
                    (o: any) => o.memberRole === "owner" || o.memberRole === "admin",
                );
                setOrgs(adminOrgs);
            })
            .catch(() => {});
    }, [repo.owner, repo.name]);

    useEffect(() => {
        fetch(`/api/repos/${repo.owner}/${repo.name}/branches`)
            .then(res => res.json())
            .then(data => {
                if (data.data) {
                    const branchNames = data.data.map((b: any) => b.name);
                    // Ensure default branch is in the list
                    if (!branchNames.includes(repo.defaultBranch)) {
                        branchNames.unshift(repo.defaultBranch);
                    }
                    setBranches(branchNames);
                }
            })
            .catch(() => {
                // Fallback: at least show the default branch
                setBranches([repo.defaultBranch]);
            });
    }, [repo.owner, repo.name, repo.defaultBranch]);

    async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.currentTarget);
        const requestedTemplateState = formData.get("isTemplate") === "on";
        const data = {
            name: formData.get("name"),
            description: formData.get("description"),
            defaultBranch: formData.get("defaultBranch"),
            hasIssues: formData.get("hasIssues") === "on",
            hasWiki: formData.get("hasWiki") === "on",
            hasActions: formData.get("hasActions") === "on",
        };

        try {
            const res = await fetch(`/api/repos/${repo.owner}/${repo.name}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!res.ok) throw new Error("Failed to update repository");

            if (requestedTemplateState !== repo.isTemplate) {
                const templateRes = await fetch(`/api/repos/${repo.owner}/${repo.name}/settings/template`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        isTemplate: requestedTemplateState,
                        acknowledgePrivateCatalogRisk: requestedTemplateState && repo.visibility === "private",
                    }),
                });

                if (!templateRes.ok) {
                    const err = await templateRes.json().catch(() => null);
                    const msg = err?.error?.message || "Failed to update template governance settings";
                    throw new Error(msg);
                }
            }

            toast.success("Repository updated successfully");
            // Short delay to let the toast be seen before reload
            setTimeout(() => window.location.reload(), 500);
        } catch (err: any) {
            toast.error(err.message || "Failed to update repository");
        } finally {
            setLoading(false);
        }
    }

    async function handleVisibility() {
        const newVisibility = repo.visibility === "public" ? "private" : "public";
        try {
            const res = await fetch(`/api/repos/${repo.owner}/${repo.name}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ visibility: newVisibility }),
            });
            if (!res.ok) throw new Error("Failed to change visibility");

            toast.success(`Visibility changed to ${newVisibility}`);
            setTimeout(() => window.location.reload(), 500);
        } catch (err: any) {
            toast.error(err.message || "Failed to change visibility");
        }
    }

    async function handleArchive() {
        try {
            const res = await fetch(`/api/repos/${repo.owner}/${repo.name}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isArchived: !repo.isArchived }),
            });
            if (!res.ok) throw new Error("Failed to update archive status");

            toast.success(`Repository ${repo.isArchived ? "unarchived" : "archived"}`);
            setTimeout(() => window.location.reload(), 500);
        } catch (err: any) {
            toast.error(err.message || "Failed to update archive status");
        }
    }

    async function handleFederationToggle() {
        setSavingFederation(true);
        try {
            const res = await fetch(`/api/repos/${repo.owner}/${repo.name}/settings/federation`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ allowExternalPulls }),
            });
            if (!res.ok) throw new Error("Failed to update federation settings");

            toast.success("Federation settings updated");
        } catch (err: any) {
            toast.error(err.message || "Failed to update federation settings");
        } finally {
            setSavingFederation(false);
        }
    }

    async function syncDefaultBranch() {
        try {
            // Fetch actual branches from git
            const res = await fetch(`/api/repos/${repo.owner}/${repo.name}/branches`);
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const actualBranch = data.data[0].name; // First branch is usually the default
                if (actualBranch !== repo.defaultBranch) {
                    // Update default branch to match actual
                    const updateRes = await fetch(`/api/repos/${repo.owner}/${repo.name}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ defaultBranch: actualBranch }),
                    });
                    if (updateRes.ok) {
                        toast.success(`Default branch updated to "${actualBranch}"`);
                        setTimeout(() => window.location.reload(), 500);
                    } else {
                        toast.error("Failed to update default branch");
                    }
                } else {
                    toast.info("Default branch is already correct");
                }
            }
        } catch {
            toast.error("Failed to sync default branch");
        }
    }

    async function handleDelete() {
        try {
            const res = await fetch(`/api/repos/${repo.owner}/${repo.name}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete repository");

            toast.success("Repository deleted");
            // Navigate immediately as the repo is gone
            window.location.href = "/dashboard";
        } catch (err: any) {
            toast.error(err.message || "Failed to delete repository");
        }
    }

    async function handleTransfer() {
        if (!transferTarget) return;
        try {
            const res = await fetch(`/api/repos/${repo.owner}/${repo.name}/transfer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orgName: transferTarget }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error?.message || "Failed to transfer repository");
            toast.success("Repository transferred");
            window.location.href = data?.data?.url || `/${transferTarget}/${repo.name}`;
        } catch (err: any) {
            toast.error(err.message || "Failed to transfer repository");
        }
    }

    return (
        <div className="space-y-8">
            <form onSubmit={handleUpdate}>
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>General</CardTitle>
                            <CardDescription>Update your repository details.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Repository Name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    defaultValue={repo.name}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    name="description"
                                    defaultValue={repo.description || ""}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="defaultBranch">Default Branch</Label>
                                <select
                                    id="defaultBranch"
                                    name="defaultBranch"
                                    defaultValue={repo.defaultBranch}
                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                    {branches.length > 0 ? (
                                        branches.map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))
                                    ) : (
                                        <option value={repo.defaultBranch}>{repo.defaultBranch}</option>
                                    )}
                                </select>
                                <p className="text-xs text-muted-foreground">
                                    The default branch is the base branch for pull requests and code comparisons.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Features</CardTitle>
                            <CardDescription>
                                Enable or disable repository features.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="hasIssues"
                                    name="hasIssues"
                                    defaultChecked={repo.hasIssues}
                                    className="accent-primary h-4 w-4"
                                />
                                <Label htmlFor="hasIssues">Issues</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="hasWiki"
                                    name="hasWiki"
                                    defaultChecked={repo.hasWiki}
                                    className="accent-primary h-4 w-4"
                                />
                                <Label htmlFor="hasWiki">Wiki</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="hasActions"
                                    name="hasActions"
                                    defaultChecked={repo.hasActions}
                                    className="accent-primary h-4 w-4"
                                />
                                <Label htmlFor="hasActions">Actions / Pipelines</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="isTemplate"
                                    name="isTemplate"
                                    defaultChecked={repo.isTemplate}
                                    className="accent-primary h-4 w-4"
                                />
                                <Label htmlFor="isTemplate">Template repository</Label>
                            </div>
                            {repo.visibility === "private" && (
                                <p className="text-xs text-muted-foreground">
                                    Private templates are discoverable only by collaborators with repository access.
                                </p>
                            )}
                        </CardContent>
                        <CardFooter className="border-t px-6 py-4">
                            <Button type="submit" disabled={loading}>
                                {loading ? "Saving..." : "Save changes"}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </form>

            {/* Sync Default Branch */}
            <Card>
                <CardHeader>
                    <CardTitle>Default Branch</CardTitle>
                    <CardDescription>
                        Current default branch: <span className="font-mono text-foreground">{repo.defaultBranch}</span>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        If your default branch doesn't match the actual branch in git, use the sync button to fix it.
                    </p>
                    <Button variant="outline" onClick={syncDefaultBranch}>
                        Sync with git
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Federation</CardTitle>
                    <CardDescription>
                        Cross-instance contributions from peer OpenCodeHub instances.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {repo.isFork && repo.forkedFromUrl && (
                        <div className="flex items-center justify-between rounded-lg border border-border p-4">
                            <div>
                                <h4 className="font-medium">Forked from</h4>
                                <p className="text-sm text-muted-foreground break-all">
                                    {repo.forkedFromUrl}
                                </p>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center justify-between rounded-lg border border-border p-4">
                        <div>
                            <h4 className="font-medium">Allow external pull requests</h4>
                            <p className="text-sm text-muted-foreground">
                                Accept pull requests whose head branch lives on a fork hosted by
                                another OpenCodeHub instance.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={allowExternalPulls}
                            onChange={(e) => setAllowExternalPulls(e.target.checked)}
                            className="accent-primary h-4 w-4"
                        />
                    </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                    <Button variant="outline" onClick={handleFederationToggle} disabled={savingFederation}>
                        {savingFederation ? "Saving..." : "Save federation settings"}
                    </Button>
                </CardFooter>
            </Card>

            <Card className="border-red-200">
                <CardHeader>
                    <CardTitle className="text-red-600">Danger Zone</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Visibility */}
                    <div className="flex items-center justify-between rounded-lg border border-red-200 p-4">
                        <div>
                            <h4 className="font-medium">Change visibility</h4>
                            <p className="text-sm text-muted-foreground">
                                This repository is currently {repo.visibility}.
                            </p>
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                    Make {repo.visibility === "public" ? "private" : "public"}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Change Visibility</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to change visibility to{" "}
                                        {repo.visibility === "public" ? "private" : "public"}?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleVisibility} className="bg-red-600 hover:bg-red-700">
                                        Confirm
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>

                    {/* Archive */}
                    <div className="flex items-center justify-between rounded-lg border border-red-200 p-4">
                        <div>
                            <h4 className="font-medium">Archive repository</h4>
                            <p className="text-sm text-muted-foreground">
                                {repo.isArchived ? "Unarchive" : "Archive"} this repository.
                            </p>
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                    {repo.isArchived ? "Unarchive" : "Archive"} repository
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>{repo.isArchived ? "Unarchive" : "Archive"} Repository</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to {repo.isArchived ? "unarchive" : "archive"} this repository?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleArchive} className="bg-red-600 hover:bg-red-700">
                                        Confirm
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>

                    {/* Transfer (WS3-05) */}
                    <div className="flex items-center justify-between rounded-lg border border-red-200 p-4">
                        <div className="flex-1 min-w-0 pr-4">
                            <h4 className="font-medium">Transfer ownership</h4>
                            <p className="text-sm text-muted-foreground">
                                Move this repository to an organization you own or administer.
                                {orgs.length === 0 && " No organizations available — create one first."}
                            </p>
                            <select
                                value={transferTarget}
                                onChange={(e) => setTransferTarget(e.target.value)}
                                className="mt-2 flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-2 py-1 text-sm"
                                disabled={orgs.length === 0}
                            >
                                <option value="">Select organization…</option>
                                {orgs.map((o) => (
                                    <option key={o.id} value={o.name}>
                                        {o.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                    disabled={!transferTarget}
                                >
                                    Transfer
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Transfer repository?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will move <strong>{repo.owner}/{repo.name}</strong> to{" "}
                                        <strong>{transferTarget || "…"}</strong>. Existing collaborators
                                        stay; you will retain admin access.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleTransfer} className="bg-red-600 hover:bg-red-700">
                                        Transfer
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>

                    {/* Delete */}
                    <div className="flex items-center justify-between rounded-lg border border-red-200 p-4">
                        <div>
                            <h4 className="font-medium">Delete this repository</h4>
                            <p className="text-sm text-muted-foreground">
                                Once you delete a repository, there is no going back. Please be
                                certain.
                            </p>
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">Delete this repository</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete the
                                        repository <strong>{repo.owner}/{repo.name}</strong> and remove all contributor
                                        associations, issues, stars, and tags.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
