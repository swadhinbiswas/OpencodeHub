
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Plus, GripVertical, Trash2 } from "lucide-react";
import type { CustomFieldDefinition } from "@/db/schema/custom-fields";

interface CustomFieldsSettingsProps {
    repositoryId: string;
    owner: string;
    repo: string;
}

export default function CustomFieldsSettings({ repositoryId, owner, repo }: CustomFieldsSettingsProps) {
    const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [newName, setNewName] = useState("");
    const [newType, setNewType] = useState("text");
    const [newDesc, setNewDesc] = useState("");
    const [newOptions, setNewOptions] = useState(""); // Comma separated
    const [isRequired, setIsRequired] = useState(false);

    useEffect(() => {
        fetchFields();
    }, [owner, repo]);

    async function fetchFields() {
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/settings/fields`);
            if (res.ok) {
                const data = await res.json();
                setFields(data);
            }
        } catch (e) {
            console.error(e);
            toast.error("Failed to load fields");
        } finally {
            setLoading(false);
        }
    }

    async function addField() {
        if (!newName) return;
        setIsSubmitting(true);

        try {
            const optionsArray = (newType === "select" || newType === "multiselect")
                ? newOptions.split(",").map(s => s.trim()).filter(Boolean)
                : null;

            const res = await fetch(`/api/repos/${owner}/${repo}/settings/fields`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newName,
                    type: newType,
                    description: newDesc,
                    options: optionsArray,
                    required: isRequired
                })
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err || "Failed to create field");
            }

            const newField = await res.json();
            setFields([...fields, newField]);

            // Reset form
            setNewName("");
            setNewType("text");
            setNewDesc("");
            setNewOptions("");
            setIsRequired(false);

            toast.success("Field created");
        } catch (e) {
            console.error(e);
            toast.error("Failed to create field");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function deleteField(id: string) {
        if (!confirm("Are you sure? All values associated with this field will be lost.")) return;
        try {
            const res = await fetch(`/api/repos/${owner}/${repo}/settings/fields/${id}`, {
                method: "DELETE"
            });

            if (!res.ok) throw new Error("Failed to delete field");

            setFields(fields.filter(f => f.id !== id));
            toast.success("Field deleted");
        } catch (e) {
            toast.error("Failed to delete field");
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Custom Issue Fields</CardTitle>
                    <CardDescription>
                        Define additional data fields for issues in this repository.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="flex justify-center p-4">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {fields.length === 0 && (
                                <p className="text-sm text-muted-foreground">No custom fields defined.</p>
                            )}

                            {fields.map(field => (
                                <div key={field.id} className="flex items-center justify-between p-3 border rounded-md bg-card">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-sm">{field.name}</p>
                                            <span className="text-xs bg-muted px-2 py-0.5 rounded uppercase">{field.type}</span>
                                            {field.required && <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">Required</span>}
                                        </div>
                                        {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                                        {field.options && Array.isArray(field.options) && (
                                            <p className="text-xs text-muted-foreground">
                                                Options: {((field.options as unknown) as string[]).join(", ")}
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteField(field.id)}
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
                            <div className="space-y-2">
                                <Label>Field Name</Label>
                                <Input
                                    placeholder="e.g. Priority"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={newType} onValueChange={setNewType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="date">Date</SelectItem>
                                        <SelectItem value="boolean">Checkbox</SelectItem>
                                        <SelectItem value="select">Select</SelectItem>
                                        <SelectItem value="multiselect">Multi-select</SelectItem>
                                        <SelectItem value="user">User</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Input
                                placeholder="Helper text for the field"
                                value={newDesc}
                                onChange={e => setNewDesc(e.target.value)}
                            />
                        </div>

                        {(newType === "select" || newType === "multiselect") && (
                            <div className="space-y-2">
                                <Label>Options (comma separated)</Label>
                                <Input
                                    placeholder="High, Medium, Low"
                                    value={newOptions}
                                    onChange={e => setNewOptions(e.target.value)}
                                />
                            </div>
                        )}

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="required"
                                checked={isRequired}
                                onCheckedChange={(c) => setIsRequired(c as boolean)}
                            />
                            <Label htmlFor="required">Required field</Label>
                        </div>

                        <Button disabled={!newName || isSubmitting} onClick={addField} className="w-full">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                            Create Field
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
