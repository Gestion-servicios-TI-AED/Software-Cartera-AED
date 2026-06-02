import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const STAGE_COLORS = {
  'Closed Won': '#10b981',
  'Closed Lost': '#ef4444',
  'Proposal/Price Quote': '#3b82f6',
  'Negotiation/Review': '#f59e0b',
};
const DEFAULT_COLOR = '#8b5cf6';

function truncate(str, max = 20) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-aed-border rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-slate-600">{payload[0].value} oportunidades</p>
    </div>
  );
}

export default function PipelineBars({ data = [] }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-400">
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
          tick={{ fontSize: 11, fill: '#94a3b8' }}
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
