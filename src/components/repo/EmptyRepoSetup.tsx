
import * as React from "react";
import { Copy, Check, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyRepoSetupProps {
    httpCloneUrl: string;
    sshCloneUrl: string;
    owner: string;
    repo: string;
}

export function EmptyRepoSetup({
    httpCloneUrl,
    sshCloneUrl,
    owner,
    repo,
}: EmptyRepoSetupProps) {
    const [protocol, setProtocol] = React.useState<"https" | "ssh">("https");
    const [copiedSection, setCopiedSection] = React.useState<string | null>(null);

    const cloneUrl = protocol === "https" ? httpCloneUrl : sshCloneUrl;

    const copyToClipboard = async (text: string, section: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedSection(section);
        setTimeout(() => setCopiedSection(null), 2000);
    };

    const CodeBlock = ({
        code,
        section,
    }: {
        code: string;
        section: string;
    }) => (
        <div className="relative group rounded-md bg-muted/50 border border-border p-4 font-mono text-sm overflow-x-auto">
            <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity bg-background border shadow-sm"
                onClick={() => copyToClipboard(code, section)}
            >
                {copiedSection === section ? (
                    <Check className="h-4 w-4 text-green-500" />
                ) : (
                    <Copy className="h-4 w-4" />
                )}
            </Button>
            <pre className="text-foreground whitespace-pre-wrap break-all pr-12 selection:bg-primary/20">
                {code}
            </pre>
        </div>
    );

    const newRepoCommand = `echo "# ${repo}" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin ${cloneUrl}
git push -u origin main`;

    const existingRepoCommand = `git remote add origin ${cloneUrl}
git branch -M main
git push -u origin main`;

    return (
        <div className="space-y-6 max-w-4xl mx-auto mt-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">
                    Quick setup — if you've done this kind of thing before
                </h2>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-muted/30 p-4 rounded-lg border">
                    <Tabs
                        defaultValue="https"
                        value={protocol}
                        onValueChange={(v) => setProtocol(v as any)}
                        className="w-full sm:w-auto"
                    >
                        <TabsList>
                            <TabsTrigger value="https">HTTPS</TabsTrigger>
                            <TabsTrigger value="ssh">SSH</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="flex-1 w-full flex items-center gap-2 bg-background border rounded-md px-3 py-2 text-sm font-mono overflow-hidden">
                        <span className="truncate">{cloneUrl}</span>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 ml-auto shrink-0"
                            onClick={() => copyToClipboard(cloneUrl, "url")}
                        >
                            {copiedSection === "url" ? (
                                <Check className="h-3 w-3 text-green-500" />
                            ) : (
                                <Copy className="h-3 w-3" />
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                        <Terminal className="h-5 w-5 text-muted-foreground" />
                        …or create a new repository on the command line
                    </h3>
                    <CodeBlock code={newRepoCommand} section="new" />
                </div>

                <div>
                    <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                        <Terminal className="h-5 w-5 text-muted-foreground" />
                        …or push an existing repository from the command line
                    </h3>
                    <CodeBlock code={existingRepoCommand} section="existing" />
                </div>

                <div className="pt-4 border-t">
                    <h3 className="text-lg font-medium mb-3">
                        …or import code from another repository
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        You can initialize this repository with code from a Subversion, Mercurial, or TFS project.
                    </p>
                    <Button variant="outline" size="sm" disabled>
                        Import code (Coming soon)
                    </Button>
                </div>
            </div>
        </div>
    );
}
