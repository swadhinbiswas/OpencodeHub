import React, { useState, useEffect, useCallback } from 'react';

interface PRProps {
  prId: number;
  title: string;
  diffs: any[]; 
}

export const KeyboardReviewInbox: React.FC<{ initialPr: PRProps }> = ({ initialPr }) => {
  const [activeChunk, setActiveChunk] = useState<number>(0);
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case 'j':
        setActiveChunk(curr => Math.min(curr + 1, initialPr.diffs.length - 1));
        break;
      case 'k':
        setActiveChunk(curr => Math.max(curr - 1, 0));
        break;
      case 'c':
        e.preventDefault();
        console.log('Focus inline comment box');
        break;
      case 'a':
        console.log('Approve PR directly without reload');
        break;
    }
  }, [initialPr.diffs.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white font-mono">
      <div className="p-4 border-b border-slate-800">
        <h2 className="text-xl font-bold">Reviewing: {initialPr.title}</h2>
        <div className="text-xs text-slate-400 mt-2 flex gap-4">
          <span>[j/k] Navigate Diffs</span>
          <span>[c] Comment</span>
          <span>[a] Approve</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {initialPr.diffs.length === 0 ? (
          <div className="text-slate-500 italic">No AST-aware changes detected.</div>
        ) : (
          initialPr.diffs.map((diff, idx) => (
            <div 
              key={idx} 
              className={\`p-4 rounded-md border transition-colors duration-150 \${idx === activeChunk ? 'border-blue-500 bg-slate-900' : 'border-slate-800'}\`}
            >
              <pre className="text-sm">{JSON.stringify(diff, null, 2)}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
