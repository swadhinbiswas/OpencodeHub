
import { useState, useEffect } from "react";
import { CommentItem } from "./CommentItem";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";  // Assuming this exists
import { toast } from "sonner";

interface PRConversationProps {
    owner: string;
    repo: string;
    pullNumber: number;
    currentUser?: any;
}

export default function PRConversation({ owner, repo, pullNumber, currentUser }: PRConversationProps) {
    const [comments, setComments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState("");
    const [isReviewMode, setIsReviewMode] = useState(false);
    const [pendingComments, setPendingComments] = useState<string[]>([]);
    const [reviewSummary, setReviewSummary] = useState("");
    const [isReviewSubmitting, setIsReviewSubmitting] = useState(false);

    useEffect(() => {
        fetchComments();
    }, [owner, repo, pullNumber]);

    useEffect(() => {
        if (!currentUser) return;
        fetchTemplates();
    }, [owner, repo, currentUser]);

    const fetchComments = async () => {
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/comments`);
            if (res.ok) {
                const data = await res.json();
                setComments(data.comments || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchTemplates = async () => {
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/review-templates`);
            if (res.ok) {
                const data = await res.json();
                const nextTemplates = data.templates || [];
                setTemplates(nextTemplates);
                const defaultTemplate = nextTemplates.find((t: any) => t.isDefault);
                if (defaultTemplate) {
                    setSelectedTemplateId(defaultTemplate.id);
                    setNewComment((prev) => (prev.trim() ? prev : defaultTemplate.content || ""));
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSubmit = async () => {
        if (!newComment.trim()) return;
        if (isReviewMode) {
            setPendingComments((prev) => [newComment.trim(), ...prev]);
            setNewComment("");
            toast.success("Added to review");
            return;
        }
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: newComment })
            });

            if (res.ok) {
                const data = await res.json();
                setComments([data.comment, ...comments]);
                setNewComment("");
                toast.success("Comment added");
            } else {
                toast.error("Failed to add comment");
            }
        } catch (e) {
            toast.error("Error adding comment");
        } finally {
            setIsSubmitting(false);
        }
    };

    const removePending = (index: number) => {
        setPendingComments((prev) => prev.filter((_, i) => i !== index));
    };

    const submitReview = async () => {
        if (pendingComments.length === 0) return;
        setIsReviewSubmitting(true);

        try {
            for (const body of pendingComments) {
                const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ body })
                });

                if (!res.ok) {
                    throw new Error("Failed to submit review comments");
                }
            }

            const reviewRes = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    state: "COMMENTED",
                    body: reviewSummary || "Review submitted"
                })
            });

            if (!reviewRes.ok) {
                throw new Error("Failed to submit review");
            }

            setPendingComments([]);
            setReviewSummary("");
            setIsReviewMode(false);
            await fetchComments();
            toast.success("Review submitted");
        } catch (e: any) {
            toast.error(e.message || "Failed to submit review");
        } finally {
            setIsReviewSubmitting(false);
        }
    };

    const handleTemplateSelect = (templateId: string) => {
        setSelectedTemplateId(templateId);
        const template = templates.find((t: any) => t.id === templateId);
        if (template?.content) {
            setNewComment(template.content);
        }
    };

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="space-y-6">
            {/* Comment Form */}
            {currentUser && (
                <div className="flex gap-3 mb-6">
                    <div className="flex-shrink-0">
                        {currentUser.avatarUrl ? (
                            <img src={currentUser.avatarUrl} alt={currentUser.username} className="h-8 w-8 rounded-full" />
                        ) : (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-medium">
                                {currentUser.username?.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 space-y-2">
                        <Textarea
                            placeholder="Leave a comment..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            className="min-h-[100px]"
                        />
                        {templates.length > 0 && (
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span>Review template</span>
                                    <select
                                        className="h-8 rounded-md border bg-background px-2 text-sm"
                                        value={selectedTemplateId}
                                        onChange={(e) => handleTemplateSelect(e.target.value)}
                                    >
                                        <option value="">Select template</option>
                                        {templates.map((template) => (
                                            <option key={template.id} value={template.id}>
                                                {template.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => handleTemplateSelect("")}
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                        <div className="flex items-center justify-between gap-3">
                            <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setIsReviewMode((prev) => !prev)}
                            >
                                {isReviewMode ? "Cancel review" : "Start review"}
                            </button>
                            <div className="flex items-center gap-2">
                                <Button disabled={!newComment.trim() || isSubmitting} onClick={handleSubmit}>
                                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                    {isReviewMode ? "Add to review" : "Comment"}
                                </Button>
                            </div>
                        </div>
                        {isReviewMode && (
                            <div className="mt-3 rounded-md border border-dashed p-3 text-sm">
                                <div className="flex items-center justify-between">
                                    <div className="font-medium">Pending review comments</div>
                                    <div className="text-xs text-muted-foreground">
                                        {pendingComments.length} pending
                                    </div>
                                </div>
                                {pendingComments.length === 0 ? (
                                    <div className="mt-2 text-xs text-muted-foreground">
                                        Add comments to include in this review.
                                    </div>
                                ) : (
                                    <div className="mt-2 space-y-2">
                                        {pendingComments.map((comment, index) => (
                                            <div key={`${index}-${comment.slice(0, 8)}`} className="flex items-start justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
                                                <div className="whitespace-pre-wrap text-xs text-foreground/90">{comment}</div>
                                                <button
                                                    type="button"
                                                    className="text-muted-foreground hover:text-foreground"
                                                    onClick={() => removePending(index)}
                                                    aria-label="Remove pending comment"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <Textarea
                                    placeholder="Add a review summary (optional)..."
                                    value={reviewSummary}
                                    onChange={(e) => setReviewSummary(e.target.value)}
                                    className="mt-3 min-h-[80px]"
                                />
                                <div className="mt-3 flex justify-end">
                                    <Button
                                        disabled={pendingComments.length === 0 || isReviewSubmitting}
                                        onClick={submitReview}
                                    >
                                        {isReviewSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                        Submit review
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="space-y-0 divide-y">
                {comments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        No comments yet. Be the first to start the conversation!
                    </div>
                ) : (
                    comments.map(comment => (
                        <CommentItem
                            key={comment.id}
                            comment={comment}
                            owner={owner}
                            repo={repo}
                            pullNumber={pullNumber}
                            currentUser={currentUser}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
