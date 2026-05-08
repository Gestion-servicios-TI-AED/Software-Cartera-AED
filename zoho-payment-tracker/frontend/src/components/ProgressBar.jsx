import React from 'react';

export default function ProgressBar({ pct, leftLabel, rightLabel }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[11px] text-slate-500">{leftLabel}</span>
        <span className="text-[12px] font-bold text-blue-500">{clamped}%</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-400 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {rightLabel && (
        <div className="flex justify-end mt-1">
          <span className="text-[10px] text-slate-400">{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
