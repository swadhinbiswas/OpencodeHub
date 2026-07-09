import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, AlertTriangle, CheckCircle2, ChevronRight, XCircle, Clock } from "lucide-react";

interface CodeOwnersEnforcementProps {
  repoOwner: string;
  repoName: string;
  prNumber: number;
}

export function CodeOwnersEnforcement({ repoOwner, repoName, prNumber }: CodeOwnersEnforcementProps) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEnforcement = async () => {
      try {
        const res = await fetch(`/api/repos/${repoOwner}/${repoName}/pulls/${prNumber}/codeowner-enforcement`);
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error?.message || payload?.message || "Failed to load policy");
        }
        setData(payload.data || payload);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEnforcement();
  }, [repoOwner, repoName, prNumber]);

  if (isLoading) {
    return (
      <div className="mt-4 border rounded-xl overflow-hidden bg-[#0d1117]/80 backdrop-blur-md shadow-sm border-white/10 animate-pulse">
        <div className="bg-white/[0.02] p-3 border-b border-white/10 flex items-center">
          <div className="h-4 w-32 bg-white/10 rounded"></div>
        </div>
        <div className="p-4 space-y-3">
          <div className="h-3 w-3/4 bg-white/5 rounded"></div>
          <div className="h-3 w-1/2 bg-white/5 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mt-4 border rounded-xl overflow-hidden bg-[#0d1117]/80 backdrop-blur-md shadow-sm border-red-500/20">
        <div className="bg-red-500/5 p-3 flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4" />
          Failed to load CODEOWNERS enforcement: {error}
        </div>
      </div>
    );
  }

  const { enforced, hasCodeOwners, rules, missingApprovals } = data;

  if (!hasCodeOwners) {
    return null; // Don't show anything if no codeowners exist
  }

  const isSatisfied = missingApprovals === 0;

  return (
    <div className={`mt-4 border rounded-xl overflow-hidden backdrop-blur-md shadow-sm ${
      enforced 
        ? (isSatisfied ? "border-green-500/20 bg-green-500/[0.02]" : "border-amber-500/20 bg-amber-500/[0.02]") 
        : "border-white/10 bg-[#0d1117]/80"
    }`}>
      <div className="bg-white/[0.02] p-3 border-b border-white/10 flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-2 text-gray-200">
          <div className={`p-1.5 rounded-md ${
            enforced ? (isSatisfied ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400") : "bg-purple-500/10 text-purple-400"
          }`}>
            <Shield className="h-4 w-4" />
          </div>
          CODEOWNERS Review
        </div>
        {enforced ? (
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
            isSatisfied ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"
          }`}>
            {isSatisfied ? "Satisfied" : "Pending"}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full border bg-white/5 border-white/10 text-gray-400 font-medium">
            Optional
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {rules && rules.length > 0 ? (
          <div className="space-y-3">
            {rules.map((rule: any, idx: number) => {
              const ruleSatisfied = rule.missingApprovals === 0;
              return (
                <div key={idx} className="bg-white/5 rounded-lg border border-white/5 p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-xs text-gray-300 break-all bg-black/30 px-2 py-1 rounded">
                      {rule.pattern}
                    </div>
                    {ruleSatisfied ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                    <span>Required:</span>
                    {rule.owners.map((owner: string) => (
                      <span key={owner} className="flex items-center gap-1 text-gray-300 font-medium">
                        <div className="h-4 w-4 rounded-full bg-blue-500/20 flex items-center justify-center text-[8px] text-blue-300">
                          {owner.replace('@', '')[0]?.toUpperCase()}
                        </div>
                        {owner}
                      </span>
                    ))}
                  </div>
                  {!ruleSatisfied && enforced && (
                    <div className="text-[11px] text-amber-400/80 font-medium flex items-center gap-1">
                      <ChevronRight className="h-3 w-3" /> Waiting for {rule.missingApprovals} approval{rule.missingApprovals !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-400 text-center py-2">
            No CODEOWNERS rules apply to these changes.
          </div>
        )}
      </div>
    </div>
  );
}
