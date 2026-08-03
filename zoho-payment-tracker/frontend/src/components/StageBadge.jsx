import React from 'react';
import { Circle } from 'lucide-react';

// Cada etapa de Zoho tiene un hue distinto — ninguna se repite (antes varias
// compartían azul). Ver spec 2026-06-18-color-clarity-refresh.
const STAGE_MAP = {
  'Qualification':        { bg: '#fffbeb', text: '#b45309', border: '#fde68a' }, // amber
  'Value Proposition':    { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' }, // sky
  'Id. Decision Makers':  { bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' }, // violet
  'Perception Analysis':  { bg: '#eef2ff', text: '#4f46e5', border: '#c7d2fe' }, // indigo
  'Proposal/Price Quote': { bg: '#f0fdfa', text: '#0e7581', border: '#99f6e4' }, // teal
  'Negotiation/Review':   { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3' }, // rose
  'Closed Won':           { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' }, // emerald
  'Closed Lost':          { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' }, // slate
};

export default function StageBadge({ stage }) {
  if (!stage) return <span className="text-slate-300">—</span>;
  const s = STAGE_MAP[stage] || { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold border"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      <Circle size={5} fill="currentColor" strokeWidth={0} />
      {stage}
    </span>
  );
}
