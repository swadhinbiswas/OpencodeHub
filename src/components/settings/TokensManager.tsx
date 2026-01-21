import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
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
import { Key, Trash2, Copy, Check, Ticket, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Token {
    id: string;
    name: string;
    tokenPrefix?: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
}

interface TokensManagerProps {
    initialTokens: Token[];
}

export default function TokensManager({ initialTokens }: TokensManagerProps) {
    const [tokens, setTokens] = useState<Token[]>(initialTokens);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isSuccessOpen, setIsSuccessOpen] = useState(false);
    const [newToken, setNewToken] = useState<string>("");
    const [loading, setLoading] = useState(false);

    // Form state
    const [name, setName] = useState("");
    const [expiresIn, setExpiresIn] = useState("30d");

    // Deletion state
    const [tokenToDelete, setTokenToDelete] = useState<string | null>(null);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("/api/user/tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, expiresIn }),
            });

            const data = await res.json();

            if (res.ok) {
                setNewToken(data.data.token.token);
                setIsCreateOpen(false);
                setIsSuccessOpen(true);

                const createdToken: Token = {
                    id: data.data.token.id,
                    name: data.data.token.name,
                    tokenPrefix: "och_" + data.data.token.token.substring(4, 12) + "...",
                    expiresAt: data.data.token.expiresAt,
                    createdAt: data.data.token.createdAt,
                    lastUsedAt: null
                };
                setTokens([createdToken, ...tokens]);
                setName("");
                setExpiresIn("30d");
            } else {
                alert(data.error?.message || "Failed to create token");
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!tokenToDelete) return;

        try {
            const res = await fetch(`/api/user/tokens/${tokenToDelete}`, {
                method: "DELETE",
            });

            if (res.ok) {
                setTokens(tokens.filter((t) => t.id !== tokenToDelete));
            } else {
                alert("Failed to delete token");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setTokenToDelete(null);
        }
    };

    const [copied, setCopied] = useState(false);
    const copyToken = () => {
        navigator.clipboard.writeText(newToken);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30">
                            <Key className="h-5 w-5 text-yellow-400" />
                        </div>
                        Access Tokens
                    </h3>
                    <p className="text-gray-500 text-sm mt-2 ml-12">
                        Tokens for API and Git over HTTPS authentication.
                    </p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white shadow-lg shadow-yellow-500/25 border-0">
                            Generate Token
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#0d1117] border-white/10 text-white sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Ticket className="h-5 w-5 text-yellow-400" />
                                Generate New Token
                            </DialogTitle>
                            <DialogDescription className="text-gray-400">
                                Create a new personal access token.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">Note</label>
                                <Input
                                    placeholder="e.g. CI/CD Pipeline"
                                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-yellow-500/50"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">Expiration</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-white/10 bg-[#1a1f2e] px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={expiresIn}
                                    onChange={(e) => setExpiresIn(e.target.value)}
                                >
                                    <option value="7d">7 days</option>
                                    <option value="30d">30 days</option>
                                    <option value="90d">90 days</option>
                                    <option value="1y">1 year</option>
                                    <option value="never">No expiration</option>
                                </select>
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" type="button" onClick={() => setIsCreateOpen(false)} className="text-gray-400 hover:text-white hover:bg-white/10">
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={loading} className="bg-yellow-500 hover:bg-yellow-600 text-white">
                                    {loading ? <RotateCw className="h-4 w-4 animate-spin mr-2" /> : null}
                                    Generate
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Success Modal */}
            <Dialog open={isSuccessOpen} onOpenChange={setIsSuccessOpen}>
                <DialogContent className="bg-[#0d1117] border-white/10 text-white sm:max-w-md text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-500/20 mb-2">
                        <Check className="h-6 w-6 text-green-400" />
                    </div>
                    <DialogHeader>
                        <DialogTitle className="text-center text-xl">Token Generated!</DialogTitle>
                        <DialogDescription className="text-center text-gray-400">
                            Copy your token now. You won't see it again!
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg p-3 border border-white/10 mt-4">
                        <code className="flex-1 bg-transparent text-sm text-white font-mono break-all text-left">
                            {newToken}
                        </code>
                        <Button size="icon" variant="ghost" onClick={copyToken} className="hover:bg-white/10 shrink-0">
                            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-gray-400" />}
                        </Button>
                    </div>
                    <DialogFooter className="sm:justify-center mt-6">
                        <Button onClick={() => setIsSuccessOpen(false)} className="w-full bg-green-600 hover:bg-green-700 text-white">
                            I have copied it
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* List */}
            <div className="relative group/list">
                <div className="absolute -inset-[1px] bg-gradient-to-r from-yellow-500/20 via-transparent to-orange-500/20 rounded-xl opacity-50" />
                <div className="relative rounded-xl border border-white/10 bg-[#0d1117]/80 backdrop-blur-sm overflow-hidden">
                    {tokens.length > 0 ? (
                        <div className="divide-y divide-white/5">
                            {tokens.map((token) => (
                                <div
                                    key={token.id}
                                    className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-yellow-500/10">
                                            <Key className="h-5 w-5 text-yellow-400" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">{token.name}</p>
                                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                                <span>
                                                    Created {new Date(token.createdAt).toLocaleDateString()}
                                                </span>
                                                {token.expiresAt && (
                                                    <span
                                                        className={cn(
                                                            "px-2 py-0.5 rounded-full",
                                                            new Date(token.expiresAt) < new Date()
                                                                ? "bg-red-500/10 text-red-400"
                                                                : "bg-gray-500/10 text-gray-400"
                                                        )}
                                                    >
                                                        {new Date(token.expiresAt) < new Date()
                                                            ? "Expired"
                                                            : `Expires ${new Date(token.expiresAt).toLocaleDateString()}`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20"
                                                onClick={() => setTokenToDelete(token.id)}
                                            >
                                                Delete
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="bg-[#0d1117] border-white/10 text-white">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                <AlertDialogDescription className="text-gray-400">
                                                    This action cannot be undone. This will permanently delete the token
                                                    "{token.name}" and any applications using it will lose access.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel className="bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white">Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700 border-0">
                                                    Delete Token
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-16">
                            <div className="relative inline-block mb-4">
                                <Ticket className="h-16 w-16 text-yellow-400" />
                                <div className="absolute inset-0 bg-yellow-500 blur-2xl opacity-20" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">
                                No tokens yet
                            </h3>
                            <p className="text-gray-500 mb-4">
                                Generate a token to access the API.
                            </p>
                            <Button onClick={() => setIsCreateOpen(true)} className="bg-gradient-to-r from-yellow-500 to-orange-600 text-white">
                                Generate your first token
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
