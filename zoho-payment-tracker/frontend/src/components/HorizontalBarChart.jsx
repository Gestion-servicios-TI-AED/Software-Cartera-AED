import React from 'react';

export default function HorizontalBarChart({ rows, total }) {
  const max = total || rows.reduce((s, r) => s + (Number(r.value) || 0), 0) || 1;
  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ label, value, color = '#bfdbfe' }) => {
        const pct = Math.round(((Number(value) || 0) / max) * 100);
        const display =
          typeof value === 'number'
            ? value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
            : value;
        return (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-24 text-right shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="text-[10px] text-slate-500 w-20 shrink-0">{display}</span>
          </div>
        );
      })}
    </div>
  );
}
