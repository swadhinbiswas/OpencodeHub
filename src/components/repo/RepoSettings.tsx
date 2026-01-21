import React, { useState } from "react";
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
import { toast } from "sonner"; // Assuming toast is available, or we'll simple alerts/console for now if not set up, but ideally use toast.

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
    };
}

export default function RepoSettings({ repo }: RepoSettingsProps) {
    const [loading, setLoading] = useState(false);

    async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.currentTarget);
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
                                <Input
                                    id="defaultBranch"
                                    name="defaultBranch"
                                    defaultValue={repo.defaultBranch}
                                />
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
                        </CardContent>
                        <CardFooter className="border-t px-6 py-4">
                            <Button type="submit" disabled={loading}>
                                {loading ? "Saving..." : "Save changes"}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </form>

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
