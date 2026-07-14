import React, { useEffect, useState, useRef } from "react";
import { CheckCircle2, XCircle, Clock, Loader2, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobNode {
    id: string;
    name: string;
    status: string;
    conclusion: string | null;
    needs: string[];
}

interface PipelineVisualizerProps {
    jobs: JobNode[];
    onJobClick?: (jobId: string) => void;
    activeJobId?: string;
}

export function PipelineVisualizer({ jobs, onJobClick, activeJobId }: PipelineVisualizerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [lines, setLines] = useState<{ id: string; d: string; status: string }[]>([]);
    const [activeId, setActiveId] = useState(activeJobId);

    // Group jobs into topological levels
    const levels: JobNode[][] = [];
    const placed = new Set<string>();
    const jobByName = new Map(jobs.map(j => [j.name, j]));

    let remaining = [...jobs];
    while (remaining.length > 0) {
        const currentLevel = remaining.filter(job => 
            !job.needs || job.needs.length === 0 || job.needs.every(n => placed.has(n))
        );

        if (currentLevel.length === 0) {
            levels.push([...remaining]);
            break;
        }

        levels.push(currentLevel);
        currentLevel.forEach(j => placed.add(j.name));
        remaining = remaining.filter(j => !placed.has(j.name));
    }

    const drawLines = () => {
        if (!containerRef.current) return;
        const container = containerRef.current.getBoundingClientRect();
        
        const newLines: { id: string; d: string; status: string }[] = [];

        jobs.forEach(job => {
            if (!job.needs || job.needs.length === 0) return;
            
            const targetEl = document.getElementById(`job-node-${job.id}`);
            if (!targetEl) return;
            
            const targetRect = targetEl.getBoundingClientRect();
            // Attach to the left edge center
            const targetX = targetRect.left - container.left;
            const targetY = targetRect.top - container.top + targetRect.height / 2;

            job.needs.forEach(needName => {
                const sourceJob = jobByName.get(needName);
                if (!sourceJob) return;
                
                const sourceEl = document.getElementById(`job-node-${sourceJob.id}`);
                if (!sourceEl) return;
                
                const sourceRect = sourceEl.getBoundingClientRect();
                // Attach to the right edge center
                const sourceX = sourceRect.right - container.left;
                const sourceY = sourceRect.top - container.top + sourceRect.height / 2;

                const cpx1 = sourceX + Math.max(40, (targetX - sourceX) * 0.5);
                const cpy1 = sourceY;
                const cpx2 = targetX - Math.max(40, (targetX - sourceX) * 0.5);
                const cpy2 = targetY;

                const d = `M ${sourceX} ${sourceY} C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${targetX} ${targetY}`;
                
                let lineStatus = "pending";
                if (sourceJob.status === "completed" && sourceJob.conclusion === "success") lineStatus = "success";
                if (sourceJob.status === "completed" && sourceJob.conclusion === "failure") lineStatus = "failure";
                if (sourceJob.status === "in_progress") lineStatus = "active";

                newLines.push({
                    id: `${sourceJob.id}-${job.id}`,
                    d,
                    status: lineStatus
                });
            });
        });

        setLines(newLines);
    };

    useEffect(() => {
        const timeout = setTimeout(drawLines, 100);
        window.addEventListener("resize", drawLines);
        
        const handleJobSelected = (e: any) => {
            if (e.detail?.jobId) setActiveId(e.detail.jobId);
        };
        window.addEventListener("job-selected", handleJobSelected);
        
        return () => {
            clearTimeout(timeout);
            window.removeEventListener("resize", drawLines);
            window.removeEventListener("job-selected", handleJobSelected);
        };
    }, [jobs]);

    const handleNodeClick = (jobId: string) => {
        setActiveId(jobId);
        window.dispatchEvent(new CustomEvent("job-selected", { detail: { jobId } }));
        if (onJobClick) onJobClick(jobId);
    };

    const getStatusIcon = (status: string, conclusion: string | null) => {
        if (status === "queued") return <div className="h-4 w-4 rounded-full border-[2.5px] border-slate-500/80 shadow-[0_0_10px_rgba(100,116,139,0.3)]" />;
        if (status === "in_progress") return <Loader2 className="h-4 w-4 text-blue-400 animate-spin drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" />;
        if (conclusion === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />;
        if (conclusion === "failure") return <XCircle className="h-4 w-4 text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" />;
        if (conclusion === "skipped") return <PlayCircle className="h-4 w-4 text-slate-500 drop-shadow-[0_0_5px_rgba(100,116,139,0.5)]" />;
        return <Clock className="h-4 w-4 text-slate-400 drop-shadow-[0_0_5px_rgba(148,163,184,0.5)]" />;
    };

    const getNodeStyles = (status: string, conclusion: string | null, isActive: boolean) => {
        let base = "bg-secondary border-border text-slate-300 hover:bg-secondary/80";
        let shadow = "";
        
        if (status === "queued") {
            base = "bg-slate-900/40 border-slate-700/60 text-slate-400 hover:bg-slate-800/60";
        } else if (status === "in_progress") {
            base = "bg-blue-500/10 border-blue-500/40 text-blue-100 hover:bg-blue-500/20";
            shadow = "shadow-[0_0_20px_rgba(59,130,246,0.15)]";
        } else if (conclusion === "success") {
            base = "bg-emerald-500/10 border-emerald-500/30 text-emerald-100 hover:bg-emerald-500/20";
        } else if (conclusion === "failure") {
            base = "bg-rose-500/10 border-rose-500/40 text-rose-100 hover:bg-rose-500/20";
            shadow = "shadow-[0_0_20px_rgba(225,29,72,0.15)]";
        }

        if (isActive) {
            base += " ring-2 ring-white/20";
            shadow = "shadow-[0_0_30px_rgba(255,255,255,0.1)] " + shadow;
        }

        return cn(base, shadow);
    };

    return (
        <div 
            ref={containerRef} 
            className="relative w-full overflow-x-auto overflow-y-hidden p-8 flex gap-20 min-h-[300px] rounded-2xl border border-border bg-[#06090e] shadow-2xl"
            style={{
                backgroundImage: `
                    radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.05) 0%, transparent 70%),
                    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
                `,
                backgroundSize: '100% 100%, 32px 32px, 32px 32px',
                backgroundPosition: '0 0, -1px -1px, -1px -1px'
            }}
        >
            <style>
                {`
                @keyframes dash {
                    to { stroke-dashoffset: -20; }
                }
                .line-active {
                    stroke-dasharray: 6, 6;
                    animation: dash 1s linear infinite;
                }
                .line-pending {
                    stroke-dasharray: 4, 8;
                }
                `}
            </style>
            
            {/* SVG Overlay for connecting lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                {lines.map(line => {
                    let strokeColor = "rgba(100, 116, 139, 0.2)";
                    let lineClass = "";
                    let strokeWidth = "2";

                    if (line.status === "success") {
                        strokeColor = "rgba(52, 211, 153, 0.5)";
                        strokeWidth = "2.5";
                    } else if (line.status === "failure") {
                        strokeColor = "rgba(244, 63, 94, 0.5)";
                        strokeWidth = "2.5";
                    } else if (line.status === "active") {
                        strokeColor = "rgba(96, 165, 250, 0.6)";
                        lineClass = "line-active";
                        strokeWidth = "2.5";
                    } else {
                        lineClass = "line-pending";
                    }

                    return (
                        <g key={line.id}>
                            {/* Glow effect for active/success/failure lines */}
                            {line.status !== "pending" && (
                                <path
                                    d={line.d}
                                    fill="none"
                                    stroke={strokeColor}
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    className="opacity-20 blur-sm"
                                />
                            )}
                            <path
                                d={line.d}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth={strokeWidth}
                                strokeLinecap="round"
                                className={cn("transition-all duration-700", lineClass)}
                            />
                        </g>
                    );
                })}
            </svg>

            {/* Nodes */}
            {levels.map((levelJobs, colIdx) => (
                <div key={colIdx} className="flex flex-col justify-center gap-8 z-10">
                    {levelJobs.map(job => {
                        const active = activeId === job.id;
                        return (
                            <button
                                key={job.id}
                                id={`job-node-${job.id}`}
                                onClick={() => handleNodeClick(job.id)}
                                className={cn(
                                    "relative flex flex-col justify-center px-4 py-3 min-h-[64px] rounded-xl border backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-1 w-[240px] text-left group",
                                    getNodeStyles(job.status, job.conclusion, active)
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="shrink-0 flex items-center justify-center p-1 rounded-md bg-black/20">
                                        {getStatusIcon(job.status, job.conclusion)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate tracking-tight">{job.name}</p>
                                        <p className={cn(
                                            "text-[11px] uppercase tracking-wider font-bold mt-0.5",
                                            job.status === "in_progress" ? "text-blue-400" :
                                            job.conclusion === "success" ? "text-emerald-500" :
                                            job.conclusion === "failure" ? "text-rose-500" :
                                            "text-slate-500"
                                        )}>
                                            {job.status === "completed" ? job.conclusion : job.status.replace("_", " ")}
                                        </p>
                                    </div>
                                </div>
                                
                                {/* Inner glow overlay for active job */}
                                {job.status === "in_progress" && (
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/0 via-blue-400/10 to-blue-500/0 animate-[pulse_2s_ease-in-out_infinite] pointer-events-none" />
                                )}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
