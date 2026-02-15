import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";

interface CommentItemProps {
    comment: any; // Type strictly if possible, but any is fine for MVP
    owner: string;
    repo: string;
    pullNumber: number;
    currentUser: any;
    onReply?: (commentId: string) => void;
}

export function CommentItem({ comment, owner, repo, pullNumber, currentUser, onReply }: CommentItemProps) {
    const [isApplying, setIsApplying] = useState(false);

    // Parse suggestion
    const suggestionRegex = /```suggestion\n([\s\S]*?)```/;
    const match = comment.body.match(suggestionRegex);
    const hasSuggestion = !!match;
    const suggestionContent = match ? match[1] : null;

    // Text parts (before and after suggestion)
    const parts = comment.body.split(suggestionRegex);
    const beforeText = parts[0];
    const afterText = parts[2] || ""; // parts[1] is the capturing group

    const handleApply = async () => {
        if (!confirm("Are you sure you want to apply this suggestion?")) return;

        setIsApplying(true);
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/suggestions/apply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    commentIds: [comment.id],
                    commitMessage: `Apply suggestion from @${comment.author.username}`
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || "Failed to apply suggestion");
            }

            toast.success("Suggestion applied!");
            // Reload to show changes
            setTimeout(() => window.location.reload(), 1000);
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div className="flex gap-3 py-4 border-b last:border-0">
            {/* Avatar */}
            <div className="flex-shrink-0">
                {comment.author.avatarUrl ? (
                    <img src={comment.author.avatarUrl} alt={comment.author.username} className="h-8 w-8 rounded-full" />
                ) : (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-medium">
                        {comment.author.username.charAt(0).toUpperCase()}
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between">
                    <div className="text-sm">
                        <span className="font-semibold text-foreground">{comment.author.displayName || comment.author.username}</span>
                        <span className="text-muted-foreground ml-2">
                            {new Date(comment.createdAt).toLocaleDateString()}
                        </span>
                    </div>
                    {/* Actions dropdown could go here */}
                </div>

                {/* Content */}
                <div className="text-sm text-foreground/90 prose dark:prose-invert max-w-none">
                    {/* Before text */}
                    {beforeText && <p className="whitespace-pre-wrap">{beforeText}</p>}

                    {/* Suggestion Block */}
                    {hasSuggestion && suggestionContent && (
                        <div className="my-3 border rounded-md overflow-hidden">
                            <div className="bg-muted px-3 py-2 text-xs font-medium flex items-center justify-between">
                                <span>Suggested change</span>
                                <div className="flex items-center gap-2">
                                    {comment.suggestionApplied ? (
                                        <span className="flex items-center gap-1 text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                                            <Check className="h-3 w-3" />
                                            Applied
                                        </span>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs bg-background"
                                            onClick={handleApply}
                                            disabled={isApplying}
                                        >
                                            {isApplying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                                            Apply suggestion
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="bg-muted/30 p-0 overflow-x-auto">
                                <pre className="p-3 text-sm font-mono m-0 bg-transparent">{suggestionContent}</pre>
                            </div>
                        </div>
                    )}

                    {/* After text */}
                    {afterText && <p className="whitespace-pre-wrap">{afterText}</p>}
                </div>
            </div>
        </div>
    );
}
