import React from 'react';
import { Circle } from 'lucide-react';

const STAGE_MAP = {
  'Qualification':        { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  'Value Proposition':    { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe' },
  'Id. Decision Makers':  { bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' },
  'Perception Analysis':  { bg: '#eff6ff', text: '#6366f1', border: '#c7d2fe' },
  'Proposal/Price Quote': { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe' },
  'Negotiation/Review':   { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3' },
  'Closed Won':           { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  'Closed Lost':          { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
};

export default function StageBadge({ stage }) {
  if (!stage) return <span className="text-slate-300">—</span>;
  const s = STAGE_MAP[stage] || { bg: '#f8faff', text: '#64748b', border: '#e2e8f0' };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      <Circle size={5} fill="currentColor" strokeWidth={0} />
      {stage}
    </span>
  );
}
