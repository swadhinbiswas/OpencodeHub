import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Edit2, AlertCircle, ChevronDown, CheckCircle2, Shield, Lock, Globe } from "lucide-react";

interface CustomState {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  allowMerge: boolean;
  requireCodeOwner: boolean;
  color?: string;
}

interface CustomPRStateProps {
  initialStateId: string | null;
  customStates: CustomState[];
  repoOwner: string;
  repoName: string;
  prNumber: number;
}

export function CustomPRState({ initialStateId, customStates, repoOwner, repoName, prNumber }: CustomPRStateProps) {
  const [selectedState, setSelectedState] = useState<string>(
    initialStateId ? `custom:${initialStateId}` : "builtin:open"
  );
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);
  const [policyData, setPolicyData] = useState<any>(null);
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(false);

  useEffect(() => {
    if (!selectedState.startsWith("custom:")) {
      setPolicyData(null);
      return;
    }
    
    const fetchPolicy = async () => {
      setIsLoadingPolicy(true);
      const stateId = selectedState.replace("custom:", "");
      try {
        const res = await fetch(`/api/repos/${repoOwner}/${repoName}/pulls/${prNumber}/required-reviewers?stateId=${encodeURIComponent(stateId)}`);
        const data = await res.json();
        if (res.ok) {
          setPolicyData(data);
        }
      } catch (e) {
        console.error("Failed to load policy", e);
      } finally {
        setIsLoadingPolicy(false);
      }
    };
    
    fetchPolicy();
  }, [selectedState, repoOwner, repoName, prNumber]);

  const handleApply = async () => {
    setIsApplying(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/repos/${repoOwner}/${repoName}/pulls/${prNumber}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedState.startsWith('custom:') ? { stateId: selectedState.replace('custom:', '') } : { state: selectedState.replace('builtin:', '') }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.message || "Failed to update state");
      }
      setMessage({ text: "State applied successfully", type: "success" });
      setTimeout(() => window.location.reload(), 1000);
    } catch (e: any) {
      setMessage({ text: e.message || "Failed to update", type: "error" });
    } finally {
      setIsApplying(false);
    }
  };

  const selectedStateObj = selectedState.startsWith("custom:") 
    ? customStates.find(s => s.id === selectedState.replace("custom:", "")) 
    : null;

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card/80 backdrop-blur-md shadow-2xl overflow-hidden mb-6">
      <div className="p-4 border-b border-border bg-white/[0.02]">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold flex items-center gap-2 text-gray-200">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Edit2 className="h-4 w-4 text-blue-400" />
            </div>
            Workflow State
          </div>
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 relative">
          <div className="relative flex-1">
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full h-9 rounded-lg border border-border bg-secondary px-3 text-sm text-gray-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 appearance-none outline-none transition-all cursor-pointer"
            >
              <option value="builtin:open">Open</option>
              <option value="builtin:closed">Closed</option>
              {customStates.map((state) => (
                <option key={state.id} value={`custom:${state.id}`}>
                  {state.displayName}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
          <button
            onClick={handleApply}
            disabled={isApplying || (initialStateId === selectedState.replace("custom:", ""))}
            className="h-9 px-4 rounded-lg bg-blue-500 hover:bg-blue-600 text-foreground text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[70px]"
          >
            {isApplying ? (
              <div className="h-4 w-4 rounded-full border-2 border-border/80 border-t-white animate-spin" />
            ) : (
              "Apply"
            )}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {selectedStateObj ? (
            <motion.div
              key="custom"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-3"
            >
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-gray-200">{selectedStateObj.displayName}</span>
                {selectedStateObj.description && <span className="ml-2">— {selectedStateObj.description}</span>}
              </div>
              
              <div className="flex flex-wrap gap-2 text-[11px] font-medium">
                {selectedStateObj.allowMerge ? (
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                    <CheckCircle2 className="h-3 w-3" /> Merge enabled
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                    <Lock className="h-3 w-3" /> Merge blocked
                  </span>
                )}
                
                {selectedStateObj.requireCodeOwner && (
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Shield className="h-3 w-3" /> CODEOWNERS enforced
                  </span>
                )}
              </div>

              {isLoadingPolicy ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />
                  Loading reviewer policy...
                </div>
              ) : policyData ? (
                <div className="text-xs space-y-1 mt-2 pt-2 border-t border-white/5">
                  <div className="text-muted-foreground">
                    Required approvals: <span className="text-foreground font-medium">{policyData.approvedRequired || 0}/{policyData.totalRequired || 0}</span>
                  </div>
                  {policyData.reviewers && policyData.reviewers.length > 0 && (
                    <div className="text-muted-foreground">
                      Waiting on: {policyData.reviewers.filter((r: any) => !r.hasApproved).map((r: any) => r.username).join(", ")}
                    </div>
                  )}
                </div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="builtin"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-xs text-muted-foreground flex items-start gap-1.5 px-1"
            >
              <Globe className="h-4 w-4 shrink-0" />
              <span>{selectedState === "builtin:closed" ? "Transitioning to Closed will close this pull request." : "Standard pull request state."}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {message && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`text-xs font-medium px-3 py-2 rounded-lg border ${
              message.type === "success" 
                ? "bg-green-500/10 text-green-400 border-green-500/20" 
                : "bg-red-500/10 text-red-400 border-red-500/20"
            }`}
          >
            {message.text}
          </motion.div>
        )}
      </div>
    </div>
  );
}
