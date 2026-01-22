
import * as React from "react";
import {
    GitBranch,
    ChevronDown,
    Copy,
    Check,
    Download,
    Code
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

interface RepoControlsProps {
    owner: string;
    repo: string;
    currentBranch: string;
    branches: string[];
    httpCloneUrl: string;
    sshCloneUrl: string;
}

export function RepoControls({
    owner,
    repo,
    currentBranch,
    branches,
    httpCloneUrl,
    sshCloneUrl,
}: RepoControlsProps) {
    const [openBranch, setOpenBranch] = React.useState(false);
    const [openClone, setOpenClone] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
                {/* Branch Selector */}
                <Popover open={openBranch} onOpenChange={setOpenBranch}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openBranch}
                            className="justify-between min-w-[150px]"
                        >
                            <div className="flex items-center gap-2">
                                <GitBranch className="h-4 w-4 opacity-50" />
                                {currentBranch}
                            </div>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search branch..." />
                            <CommandList>
                                <CommandEmpty>No branch found.</CommandEmpty>
                                <CommandGroup heading="Branches">
                                    {branches.map((branch) => (
                                        <CommandItem
                                            key={branch}
                                            value={branch}
                                            onSelect={() => {
                                                window.location.href = `/${owner}/${repo}/tree/${branch}`;
                                                setOpenBranch(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    currentBranch === branch ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {branch}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>

            <div className="flex items-center gap-2">
                {/* Clone Button */}
                <Popover open={openClone} onOpenChange={setOpenClone}>
                    <PopoverTrigger asChild>
                        <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                            <Code className="h-4 w-4" />
                            Code
                            <ChevronDown className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-4" align="end">
                        <Tabs defaultValue="https" className="w-full">
                            <TabsList className="w-full grid grid-cols-2">
                                <TabsTrigger value="https">HTTPS</TabsTrigger>
                                <TabsTrigger value="ssh">SSH</TabsTrigger>
                            </TabsList>

                            <div className="mt-4">
                                <TabsContent value="https" className="mt-0">
                                    <div className="flex items-center gap-2">
                                        <Input readOnly value={httpCloneUrl} className="h-9 font-mono text-xs" />
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            className="h-9 w-9 shrink-0"
                                            onClick={() => copyToClipboard(httpCloneUrl)}
                                        >
                                            {copied ? (
                                                <Check className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </TabsContent>
                                <TabsContent value="ssh" className="mt-0">
                                    <div className="flex items-center gap-2">
                                        <Input readOnly value={sshCloneUrl} className="h-9 font-mono text-xs" />
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            className="h-9 w-9 shrink-0"
                                            onClick={() => copyToClipboard(sshCloneUrl)}
                                        >
                                            {copied ? (
                                                <Check className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </TabsContent>
                            </div>

                            <div className="mt-4 border-t pt-4">
                                <a
                                    href={`/${owner}/${repo}/archive/refs/heads/${currentBranch}.zip`}
                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                                >
                                    <Download className="h-4 w-4" />
                                    Download ZIP
                                </a>
                            </div>
                        </Tabs>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}
