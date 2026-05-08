import React from 'react';

export default function KpiCard({ icon, iconBg, label, value, sub }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-base mb-1 flex-shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <span className="text-[11px] text-slate-400 font-medium">{label}</span>
      <span className="text-[22px] font-bold text-slate-800 leading-tight tracking-tight">
        {value ?? '—'}
      </span>
      {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
    </div>
  );
}
