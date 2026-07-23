import React from 'react';
import HelpTip from './HelpTip';

export default function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub, hint }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          {Icon && <Icon size={16} color={iconColor} strokeWidth={2} />}
        </div>
        <span className="inline-flex items-center gap-1 text-[14px] text-slate-500 font-medium">
          {label}
          {hint && <HelpTip text={hint} size={11} />}
        </span>
      </div>
      <span className="font-heading text-[25px] font-bold text-ink leading-tight tracking-tight">
        {value ?? '—'}
      </span>
      {sub && <span className="text-[14px] text-slate-500">{sub}</span>}
    </div>
  );
}
