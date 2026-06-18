import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// Alineado con los hues de StageBadge — cada etapa su propio color.
const STAGE_COLORS = {
  'Closed Won': '#047857',           // emerald
  'Closed Lost': '#b91c1c',          // red
  'Proposal/Price Quote': '#0f766e', // teal (marca)
  'Negotiation/Review': '#e11d48',   // rose
  'Qualification': '#b45309',        // amber
  'Value Proposition': '#0369a1',    // sky
  'Id. Decision Makers': '#7c3aed',  // violet
  'Perception Analysis': '#4f46e5',  // indigo
};
const DEFAULT_COLOR = '#64748b';

function truncate(str, max = 20) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-aed-border rounded-lg px-3 py-2 shadow-sm text-[14px]">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-slate-600">{payload[0].value} oportunidades</p>
    </div>
  );
}

export default function PipelineBars({ data = [] }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-[16px] text-slate-400">
        Sin datos de pipeline
      </div>
    );
  }

  const chartData = data.map((d) => ({ ...d, stageLabel: truncate(d.stage) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="stageLabel"
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
          width={130}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={STAGE_COLORS[entry.stage] ?? DEFAULT_COLOR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
