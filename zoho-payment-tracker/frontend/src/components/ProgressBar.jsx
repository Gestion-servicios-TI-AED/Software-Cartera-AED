function barColor(pct) {
  if (pct >= 80) return 'from-emerald-400 to-green-500';
  if (pct >= 40) return 'from-amber-400 to-yellow-400';
  return 'from-red-400 to-rose-400';
}

function pctColor(pct) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 40) return 'text-amber-500';
  return 'text-rose-500';
}

export default function ProgressBar({ pct, leftLabel, rightLabel }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[11px] text-slate-500">{leftLabel}</span>
        <span className={`text-[12px] font-bold ${pctColor(clamped)}`}>{clamped}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor(clamped)} transition-all duration-500`}
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
