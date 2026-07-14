import React, { useState, useEffect } from "react";
import { Folder, File, ChevronRight, ChevronDown, GitCommit, X, GitBranch, RefreshCw, XCircle, AlertTriangle, Layout, Search, Settings, Home, Activity, Loader2 } from "lucide-react";
import Editor from "@monaco-editor/react";
import { cn } from "@/lib/utils";

interface WebIDEProps {
    owner: string;
    repo: string;
    defaultBranch: string;
    initialBranch?: string;
    initialFile?: string;
    currentUser: any;
}

// Simple Tree structure
type TreeNode = {
    name: string;
    path: string;
    type: "file" | "dir";
    children?: TreeNode[];
    isOpen?: boolean;
};

export function WebIDE({ owner, repo, defaultBranch, initialBranch, initialFile, currentUser }: WebIDEProps) {
    const [currentBranch, setCurrentBranch] = useState(initialBranch || defaultBranch);
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [openFiles, setOpenFiles] = useState<{path: string, content: string, originalContent: string, isModified: boolean}[]>([]);
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"explorer" | "search" | "scm">("explorer");
    const [commitMessage, setCommitMessage] = useState("");
    const [committing, setCommitting] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Fetch tree
    useEffect(() => {
        const fetchTree = async () => {
            try {
                const res = await fetch(`/api/repos/${owner}/${repo}/ide/fs?action=tree&branch=${currentBranch}`);
                const data = await res.json();
                if (data.data?.files) {
                    const paths: string[] = data.data.files;
                    const root: TreeNode[] = [];

                    paths.forEach(p => {
                        const parts = p.split("/");
                        let currentLevel = root;
                        let currentPath = "";

                        parts.forEach((part, idx) => {
                            currentPath += (currentPath ? "/" : "") + part;
                            const isFile = idx === parts.length - 1;
                            
                            let node = currentLevel.find(n => n.name === part);
                            if (!node) {
                                node = { name: part, path: currentPath, type: isFile ? "file" : "dir", children: isFile ? undefined : [], isOpen: false };
                                currentLevel.push(node);
                            }
                            if (!isFile) {
                                currentLevel = node.children!;
                            }
                        });
                    });

                    // Sort: dirs first
                    const sortTree = (nodes: TreeNode[]) => {
                        nodes.sort((a, b) => {
                            if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
                            return a.name.localeCompare(b.name);
                        });
                        nodes.forEach(n => n.children && sortTree(n.children));
                    };
                    sortTree(root);
                    
                    // Auto-open directories for initial file
                    if (initialFile) {
                        const parts = initialFile.split("/");
                        let currentPath = "";
                        parts.forEach((part, idx) => {
                            if (idx < parts.length - 1) {
                                currentPath += (currentPath ? "/" : "") + part;
                                const openDir = (nodes: TreeNode[]) => {
                                    for (const node of nodes) {
                                        if (node.path === currentPath && node.type === "dir") {
                                            node.isOpen = true;
                                        }
                                        if (node.children) openDir(node.children);
                                    }
                                };
                                openDir(root);
                            }
                        });
                    }
                    
                    setTree(root);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchTree();
    }, [owner, repo, currentBranch]);

    useEffect(() => {
        if (initialFile && !loading) {
            handleOpenFile(initialFile);
        }
    }, [initialFile, loading]);

    const handleOpenFile = async (path: string) => {
        if (!openFiles.find(f => f.path === path)) {
            // fetch content
            try {
                const res = await fetch(`/api/repos/${owner}/${repo}/ide/fs?action=file&branch=${currentBranch}&path=${encodeURIComponent(path)}`);
                const data = await res.json();
                if (data.data?.content !== undefined) {
                    setOpenFiles(prev => [...prev, { path, content: data.data.content, originalContent: data.data.content, isModified: false }]);
                }
            } catch (e) {
                console.error(e);
            }
        }
        setActiveFile(path);
    };

    const handleCloseFile = (path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setOpenFiles(prev => {
            const next = prev.filter(f => f.path !== path);
            if (activeFile === path) {
                setActiveFile(next.length > 0 ? next[next.length - 1].path : null);
            }
            return next;
        });
    };

    const handleEditorChange = (val: string | undefined) => {
        if (!activeFile || val === undefined) return;
        setOpenFiles(prev => prev.map(f => {
            if (f.path === activeFile) {
                return { ...f, content: val, isModified: val !== f.originalContent };
            }
            return f;
        }));
    };

    const modifiedFiles = openFiles.filter(f => f.isModified);

    const handleCommit = async () => {
        if (modifiedFiles.length === 0 || !commitMessage.trim()) return;
        setCommitting(true);
        try {
            const filesRecord: Record<string, string> = {};
            modifiedFiles.forEach(f => filesRecord[f.path] = f.content);

            const res = await fetch(`/api/repos/${owner}/${repo}/ide/fs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    branch: currentBranch,
                    message: commitMessage,
                    files: filesRecord
                })
            });

            if (res.ok) {
                setOpenFiles(prev => prev.map(f => ({ ...f, originalContent: f.content, isModified: false })));
                setCommitMessage("");
                alert("Committed successfully!");
            } else {
                const data = await res.json();
                alert("Failed to commit: " + data.message);
            }
        } catch (e) {
            console.error(e);
            alert("Error committing");
        } finally {
            setCommitting(false);
        }
    };

    const toggleDir = (node: TreeNode, e: React.MouseEvent) => {
        e.stopPropagation();
        const toggleNode = (nodes: TreeNode[]): TreeNode[] => {
            return nodes.map(n => {
                if (n.path === node.path) return { ...n, isOpen: !n.isOpen };
                if (n.children) return { ...n, children: toggleNode(n.children) };
                return n;
            });
        };
        setTree(toggleNode(tree));
    };

    const renderTree = (nodes: TreeNode[], depth = 0) => {
        return nodes.map(node => (
            <div key={node.path}>
                <div 
                    className={cn(
                        "flex items-center gap-1.5 px-2 py-0.5 hover:bg-[#2a2d2e] cursor-pointer text-[13px] select-none",
                        activeFile === node.path && "bg-[#37373d] text-foreground"
                    )}
                    style={{ paddingLeft: `${depth * 12 + 4}px` }}
                    onClick={(e) => node.type === "file" ? handleOpenFile(node.path) : toggleDir(node, e)}
                >
                    {node.type === "dir" ? (
                        <div className="flex items-center gap-1 w-4">
                            {node.isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </div>
                    ) : (
                        <div className="w-4" />
                    )}
                    
                    {node.type === "dir" ? (
                        <Folder className="h-3.5 w-3.5 text-[#dcb67a]" fill="currentColor" />
                    ) : (
                        <File className="h-3.5 w-3.5 text-[#519aba]" />
                    )}
                    <span className="truncate tracking-wide">{node.name}</span>
                </div>
                {node.type === "dir" && node.isOpen && node.children && renderTree(node.children, depth + 1)}
            </div>
        ));
    };

    const activeFileData = openFiles.find(f => f.path === activeFile);

    const getLanguage = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch(ext) {
            case 'ts': case 'tsx': return 'typescript';
            case 'js': case 'jsx': return 'javascript';
            case 'json': return 'json';
            case 'css': return 'css';
            case 'html': return 'html';
            case 'md': return 'markdown';
            case 'astro': return 'html'; 
            case 'py': return 'python';
            case 'go': return 'go';
            case 'rs': return 'rust';
            case 'yml': case 'yaml': return 'yaml';
            case 'sh': return 'shell';
            case 'sql': return 'sql';
            default: return 'plaintext';
        }
    };

    return (
        <div className="flex flex-col h-screen w-full bg-[#1e1e1e] text-[#cccccc] font-sans overflow-hidden select-none">
            {/* VS Code Title Bar */}
            <div className="h-8 w-full bg-[#3c3c3c] flex items-center px-3 border-b border-[#2d2d2d] shrink-0 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                    <img src="/logo.svg" alt="logo" className="h-4 w-4 mr-2 opacity-90 brightness-200" />
                    <span className="cursor-default hover:bg-secondary/80 px-2 py-1 rounded transition-colors">File</span>
                    <span className="cursor-default hover:bg-secondary/80 px-2 py-1 rounded transition-colors">Edit</span>
                    <span className="cursor-default hover:bg-secondary/80 px-2 py-1 rounded transition-colors">Selection</span>
                    <span className="cursor-default hover:bg-secondary/80 px-2 py-1 rounded transition-colors">View</span>
                    <span className="cursor-default hover:bg-secondary/80 px-2 py-1 rounded transition-colors">Go</span>
                    <span className="cursor-default hover:bg-secondary/80 px-2 py-1 rounded transition-colors">Run</span>
                    <span className="cursor-default hover:bg-secondary/80 px-2 py-1 rounded transition-colors">Terminal</span>
                    <span className="cursor-default hover:bg-secondary/80 px-2 py-1 rounded transition-colors">Help</span>
                </div>
                <div className="flex-1 flex justify-center text-muted-foreground font-medium">
                    {activeFileData ? `${activeFileData.path.split("/").pop()} - ` : ""}{repo} - OpenCodeHub
                </div>
                <div className="w-48 flex justify-end items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                    <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                    <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                </div>
            </div>

            <div className="flex-1 flex min-h-0">
                {/* Activity Bar */}
                <div className="w-12 shrink-0 bg-[#333333] flex flex-col items-center py-3 gap-6 border-r border-[#252526]">
                    <button 
                        onClick={() => {
                            if (activeTab === "explorer" && isSidebarOpen) setIsSidebarOpen(false);
                            else { setActiveTab("explorer"); setIsSidebarOpen(true); }
                        }}
                        className={cn("relative p-2 rounded-md hover:text-foreground transition-colors", activeTab === "explorer" && isSidebarOpen ? "text-foreground" : "text-[#858585]")}
                        title="Explorer"
                    >
                        {activeTab === "explorer" && isSidebarOpen && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-full bg-[#007fd4]" />}
                        <File className="h-6 w-6 stroke-[1.5px]" />
                    </button>
                    <button 
                        onClick={() => {
                            if (activeTab === "search" && isSidebarOpen) setIsSidebarOpen(false);
                            else { setActiveTab("search"); setIsSidebarOpen(true); }
                        }}
                        className={cn("relative p-2 rounded-md hover:text-foreground transition-colors", activeTab === "search" && isSidebarOpen ? "text-foreground" : "text-[#858585]")}
                        title="Search"
                    >
                        {activeTab === "search" && isSidebarOpen && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-full bg-[#007fd4]" />}
                        <Search className="h-6 w-6 stroke-[1.5px]" />
                    </button>
                    <button 
                        onClick={() => {
                            if (activeTab === "scm" && isSidebarOpen) setIsSidebarOpen(false);
                            else { setActiveTab("scm"); setIsSidebarOpen(true); }
                        }}
                        className={cn("relative p-2 rounded-md hover:text-foreground transition-colors", activeTab === "scm" && isSidebarOpen ? "text-foreground" : "text-[#858585]")}
                        title="Source Control"
                    >
                        {activeTab === "scm" && isSidebarOpen && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-full bg-[#007fd4]" />}
                        <GitCommit className="h-6 w-6 stroke-[1.5px]" />
                        {modifiedFiles.length > 0 && (
                            <span className="absolute bottom-1 right-1 h-4 w-4 bg-[#007fd4] rounded-full text-[9px] flex items-center justify-center text-foreground font-bold">
                                {modifiedFiles.length}
                            </span>
                        )}
                    </button>
                    
                    <div className="mt-auto flex flex-col gap-4">
                        <a href={`/${owner}/${repo}`} className="p-2 text-[#858585] hover:text-foreground" title="Back to Repo">
                            <Home className="h-6 w-6 stroke-[1.5px]" />
                        </a>
                        <button className="p-2 text-[#858585] hover:text-foreground" title="Settings">
                            <Settings className="h-6 w-6 stroke-[1.5px]" />
                        </button>
                    </div>
                </div>

                {/* Sidebar */}
                {isSidebarOpen && (
                    <div className="w-[260px] shrink-0 bg-[#252526] flex flex-col border-r border-[#1e1e1e]">
                        <div className="px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-[#bbbbbb]">
                            {activeTab === "explorer" && "Explorer"}
                            {activeTab === "search" && "Search"}
                            {activeTab === "scm" && "Source Control"}
                        </div>
                        
                        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4">
                            {activeTab === "explorer" && (
                                <div className="py-0">
                                    <div className="px-2 py-1 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#cccccc] hover:bg-[#2a2d2e] cursor-pointer">
                                        <div className="flex items-center gap-1">
                                            <ChevronDown className="h-3.5 w-3.5" />
                                            <span>{repo}</span>
                                        </div>
                                    </div>
                                    <div className="mt-1">
                                        {loading ? (
                                            <div className="px-6 py-4 text-xs text-muted-foreground flex items-center gap-2">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                                            </div>
                                        ) : (
                                            renderTree(tree)
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === "search" && (
                                <div className="px-4 py-2 text-sm text-muted-foreground">
                                    Search is not available in the web editor.
                                </div>
                            )}

                            {activeTab === "scm" && (
                                <div className="px-4 py-2 space-y-4">
                                    <div className="space-y-2">
                                        <textarea 
                                            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007fd4] outline-none rounded p-2 text-[13px] resize-none text-[#cccccc] placeholder:text-[#858585]"
                                            rows={3}
                                            placeholder="Message (Enter to commit on 'main')"
                                            value={commitMessage}
                                            onChange={e => setCommitMessage(e.target.value)}
                                        />
                                        <button
                                            onClick={handleCommit}
                                            disabled={committing || modifiedFiles.length === 0 || !commitMessage.trim()}
                                            className="w-full bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed text-foreground text-[13px] py-1 rounded flex items-center justify-center gap-2 transition-colors"
                                        >
                                            {committing && <Loader2 className="h-3 w-3 animate-spin" />}
                                            Commit & Push
                                        </button>
                                    </div>

                                    <div className="mt-4">
                                        <div className="flex items-center justify-between text-[11px] font-bold text-[#cccccc] uppercase tracking-wider mb-1 px-1 hover:bg-[#2a2d2e] py-1 cursor-pointer">
                                            <div className="flex items-center gap-1">
                                                <ChevronDown className="h-3.5 w-3.5" />
                                                <span>Changes</span>
                                            </div>
                                            <span className="bg-[#4d4d4d] text-foreground px-1.5 rounded-full text-[10px]">{modifiedFiles.length}</span>
                                        </div>
                                        <div className="mt-1">
                                            {modifiedFiles.map(f => (
                                                <div key={f.path} className="flex items-center gap-2 text-[13px] py-1 px-4 hover:bg-[#2a2d2e] cursor-pointer text-[#e2c08d]">
                                                    <File className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate">{f.path.split("/").pop()}</span>
                                                    <span className="text-[10px] text-[#858585] truncate">{f.path}</span>
                                                    <div className="ml-auto text-[#e2c08d] font-bold text-xs shrink-0">M</div>
                                                </div>
                                            ))}
                                            {modifiedFiles.length === 0 && (
                                                <div className="text-[13px] text-[#858585] px-4 py-2">No changes to commit.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Main Editor Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
                    {/* Tabs */}
                    <div className="flex bg-[#252526] overflow-x-auto no-scrollbar">
                        {openFiles.map(f => {
                            const filename = f.path.split("/").pop();
                            const isActive = activeFile === f.path;
                            return (
                                <div 
                                    key={f.path}
                                    onClick={() => setActiveFile(f.path)}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-2 text-[13px] min-w-[120px] max-w-[200px] cursor-pointer border-r border-[#252526] group relative",
                                        isActive ? "bg-[#1e1e1e] text-[#cccccc]" : "bg-[#2d2d2d] text-[#858585] hover:bg-[#2b2b2b]"
                                    )}
                                >
                                    <span className={cn("truncate flex-1 font-medium", f.isModified && "italic")}>
                                        {filename}
                                    </span>
                                    <div className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-secondary/80">
                                        {f.isModified ? (
                                            <div className={cn("w-2.5 h-2.5 rounded-full bg-white", isActive ? "opacity-100" : "opacity-50")} />
                                        ) : (
                                            <X 
                                                className={cn("h-4 w-4 text-[#858585] hover:text-[#cccccc] opacity-0 group-hover:opacity-100")} 
                                                onClick={(e) => handleCloseFile(f.path, e)}
                                            />
                                        )}
                                    </div>
                                    {isActive && <div className="absolute top-0 left-0 w-full h-[1px] bg-[#007fd4]" />}
                                </div>
                            );
                        })}
                    </div>

                    {/* Breadcrumbs */}
                    {activeFileData && (
                        <div className="h-6 flex items-center px-4 text-[12px] text-[#cccccc] bg-[#1e1e1e] shadow-sm z-10 border-b border-[#252526]">
                            {activeFileData.path.split("/").map((part, i, arr) => (
                                <React.Fragment key={i}>
                                    <span className="cursor-pointer hover:text-foreground font-medium opacity-80 transition-opacity">{part}</span>
                                    {i < arr.length - 1 && <ChevronRight className="h-3 w-3 mx-1 opacity-50" />}
                                </React.Fragment>
                            ))}
                        </div>
                    )}

                    {/* Editor container */}
                    <div className="flex-1 relative cursor-text">
                        {activeFileData ? (
                            <Editor
                                height="100%"
                                theme="vs-dark"
                                language={getLanguage(activeFileData.path)}
                                value={activeFileData.content}
                                onChange={handleEditorChange}
                                options={{
                                    minimap: { enabled: true, scale: 0.75, renderCharacters: false },
                                    fontSize: 13,
                                    fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    padding: { top: 12 },
                                    lineHeight: 1.5,
                                    cursorBlinking: "smooth",
                                    cursorSmoothCaretAnimation: "on",
                                    formatOnPaste: true,
                                    renderWhitespace: "selection",
                                }}
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-[#858585] select-none bg-[#1e1e1e]">
                                <img src="/logo.svg" alt="logo" className="h-24 w-24 mb-6 opacity-5 grayscale" />
                                <div className="flex gap-12 text-sm text-[#858585]">
                                    <div className="flex flex-col gap-3">
                                        <div className="font-semibold text-[#cccccc]">Start</div>
                                        <div className="flex gap-4"><span>New File</span><span className="opacity-50">Ctrl+N</span></div>
                                        <div className="flex gap-4"><span>Open File...</span><span className="opacity-50">Ctrl+O</span></div>
                                        <div className="flex gap-4"><span>Open Folder...</span><span className="opacity-50">Ctrl+K Ctrl+O</span></div>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        <div className="font-semibold text-[#cccccc]">Recent</div>
                                        <div className="italic opacity-70 text-xs">No recent folders opened.</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Status Bar */}
            <div className="h-[22px] shrink-0 bg-[#007acc] text-foreground flex items-center justify-between px-2 text-[11px] font-medium tracking-wide">
                <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1 cursor-pointer hover:bg-white/20 px-2 h-full transition-colors">
                        <GitBranch className="h-3 w-3" />
                        <span>{currentBranch}</span>
                    </div>
                    <div className="flex items-center gap-1 cursor-pointer hover:bg-white/20 px-2 h-full transition-colors">
                        <RefreshCw className="h-3 w-3" />
                    </div>
                    <div className="flex items-center gap-1 cursor-pointer hover:bg-white/20 px-2 h-full transition-colors">
                        <XCircle className="h-3 w-3" /> 0 
                        <AlertTriangle className="h-3 w-3 ml-1" /> 0
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <div className="cursor-pointer hover:bg-white/20 px-2 h-full flex items-center transition-colors">Ln 1, Col 1</div>
                    <div className="cursor-pointer hover:bg-white/20 px-2 h-full flex items-center transition-colors">Spaces: 4</div>
                    <div className="cursor-pointer hover:bg-white/20 px-2 h-full flex items-center transition-colors">UTF-8</div>
                    <div className="cursor-pointer hover:bg-white/20 px-2 h-full flex items-center transition-colors">LF</div>
                    <div className="cursor-pointer hover:bg-white/20 px-2 h-full flex items-center transition-colors">
                        {activeFileData ? getLanguage(activeFileData.path) : "Plain Text"}
                    </div>
                    <div className="flex items-center gap-1 cursor-pointer hover:bg-white/20 px-2 h-full transition-colors">
                        <Layout className="h-3 w-3" />
                    </div>
                </div>
            </div>
        </div>
    );
}
